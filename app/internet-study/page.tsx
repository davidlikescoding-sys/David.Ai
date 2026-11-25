"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { mirrorStudyFindingsToBrain, runInternetStudy, saveStudyFindings, type StudyResult, type StudySaveResult } from "@/lib/research/study";
import type { ResearchActivity, ResearchFinding, ResearchIntent, SourceSearchResult, WebPage } from "@/lib/research/types";
import { WEB_CATEGORY } from "@/lib/research/knowledge";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, ProgressBar, Select, Stat } from "@/components/ui";

const PAGE_LIMITS = [4, 8, 12];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function searchWeb(query: string, intent: ResearchIntent, signal?: AbortSignal): Promise<SourceSearchResult[]> {
  const response = await fetch("/api/research/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, intent }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? `Search failed (${response.status}).`);
  return (data.results ?? []) as SourceSearchResult[];
}

async function readWeb(url: string, signal?: AbortSignal): Promise<WebPage> {
  const response = await fetch("/api/research/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? `Read failed (${response.status}).`);
  return data.page as WebPage;
}

function statusTone(status: ResearchActivity["status"]): "cyan" | "green" | "amber" | "red" {
  if (status === "ok") return "green";
  if (status === "running") return "cyan";
  if (status === "error") return "red";
  return "amber";
}

export default function InternetStudyPage() {
  const { knowledge, addKnowledge, updateKnowledge, logActivity } = useStore();
  const [topic, setTopic] = useState("");
  const [maxPages, setMaxPages] = useState(8);
  const [autoSave, setAutoSave] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StudyResult | null>(null);
  const [activities, setActivities] = useState<ResearchActivity[]>([]);
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [studiedTopic, setStudiedTopic] = useState("");
  const [saveStats, setSaveStats] = useState<StudySaveResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const webEntryCount = useMemo(() => knowledge.filter((entry) => entry.category === WEB_CATEGORY).length, [knowledge]);
  const statementCount = findings.reduce((total, finding) => total + finding.sentences.length, 0);
  const sourceCount = new Set(findings.map((finding) => finding.hit.source)).size;
  const completedPages = activities.filter((activity) =>
    activity.stage === "opening" && /^(?:Read |Could not open |Kept Google News)/.test(activity.message)).length;
  const progress = result ? 100 : running ? Math.min(95, Math.round((completedPages / Math.max(1, maxPages)) * 100)) : 0;
  const visibleActivities = running ? activities : activities.filter((activity) => activity.status !== "running");
  const errorText = error ?? (result?.errors.length ? `${result.errors[0]}${result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : ""}` : null);

  const persistFindings = useCallback(async (items: ResearchFinding[], label: string) => {
    if (!items.length) return;
    const stats = saveStudyFindings({
      findings: items,
      knowledge,
      topic: label,
      addKnowledge,
      updateKnowledge,
    });
    setSaveStats((previous) => previous ? {
      added: previous.added + stats.added,
      updated: previous.updated + stats.updated,
      skipped: previous.skipped + stats.skipped,
    } : stats);
    logActivity("success", `Internet Study saved ${stats.added} new and updated ${stats.updated} knowledge entry/entries for “${label}”.`);
    const mirror = await mirrorStudyFindingsToBrain(items);
    if (mirror.saved || mirror.failed) {
      logActivity(mirror.failed ? "warning" : "success",
        `Mirrored ${mirror.saved} finding(s) to the local SQLite brain${mirror.failed ? `; ${mirror.failed} could not be saved` : ""}.`);
    }
  }, [knowledge, addKnowledge, updateKnowledge, logActivity]);

  const startStudy = useCallback(async () => {
    const cleanTopic = topic.trim().replace(/\s+/g, " ").slice(0, 90);
    if (cleanTopic.length < 2) {
      setError("Enter a topic with at least two characters.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setResult(null);
    setActivities([]);
    setFindings([]);
    setSaveStats(null);
    setStudiedTopic(cleanTopic);
    logActivity("info", `Internet Study started for “${cleanTopic}”.`);

    try {
      const next = await runInternetStudy(cleanTopic, {
        search: searchWeb,
        read: readWeb,
        onActivity: (activity) => setActivities((previous) => [...previous, activity]),
        signal: controller.signal,
        maxPages,
        localEntryCount: knowledge.length,
      });
      setResult(next);
      setActivities(next.activities);
      setFindings(next.findings);
      if (autoSave) await persistFindings(next.findings, next.topic);
    } catch (caught) {
      if (controller.signal.aborted) setError("Internet Study was stopped.");
      else setError(errorMessage(caught));
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, [topic, maxPages, autoSave, knowledge.length, persistFindings, logActivity]);

  const stopStudy = useCallback(() => {
    abortRef.current?.abort();
    logActivity("warning", "Internet Study was stopped.");
  }, [logActivity]);

  return (
    <>
      <PageHeader
        eyebrow="Bounded Web Learning"
        title="Internet Study"
        description="Activate a study session to search free public sources, read real pages, extract topic-relevant statements, and save them to your local knowledge base with the original URL and retrieval date. Web text is treated as data, never as instructions."
        actions={<>
          <Button variant={running ? "danger" : "primary"} onClick={running ? stopStudy : () => void startStudy()}>
            {running ? "Stop study" : "Activate study"}
          </Button>
        </>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <Card title="Study session" subtitle="One activation runs a fixed, inspectable research plan.">
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void startStudy(); }}>
              <Field label="Topic to study" hint="Use a subject, concept, place, person, or question focus.">
                <Input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="e.g. coral reefs, probability, the Roman Empire"
                  maxLength={90}
                  disabled={running}
                />
              </Field>
              <Field label="Page limit" hint="Hard cap on pages opened in one session. Requests are limited and failures are reported.">
                <Select value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} disabled={running}>
                  {PAGE_LIMITS.map((limit) => <option key={limit} value={limit}>{limit} pages</option>)}
                </Select>
              </Field>
              <label className="flex items-start gap-2 rounded border hairline bg-black/20 p-3 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(event) => setAutoSave(event.target.checked)}
                  disabled={running}
                  className="mt-0.5 accent-cyan-400"
                />
                <span>Automatically save extracted statements to the knowledge base and mirror the same filtered evidence into the local SQLite brain when the study finishes.</span>
              </label>
              <ErrorBox message={errorText} />
              <Button type="submit" variant="primary" className="w-full" disabled={running}>
                {running ? "Studying…" : "Activate study"}
              </Button>
            </form>
            {(running || result) && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>{running ? "Reading and extracting…" : "Study complete"}</span>
                  <span className="font-mono">{completedPages}/{maxPages} pages</span>
                </div>
                <ProgressBar value={progress} label="Study progress" />
              </div>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Saved web entries" value={webEntryCount} tone="text-cyan-300" />
            <Stat label="Pages read" value={result?.pagesRead ?? 0} />
            <Stat label="Statements" value={statementCount} />
            <Stat label="Sources" value={sourceCount} />
          </div>

          {saveStats && (
            <Card title="Last save" subtitle="Deduplicated against the existing knowledge base.">
              <div className="flex flex-wrap gap-2">
                <Badge tone="green">{saveStats.added} added</Badge>
                <Badge tone="cyan">{saveStats.updated} updated</Badge>
                <Badge>{saveStats.skipped} unchanged</Badge>
              </div>
            </Card>
          )}

          <Card title="Safety bounds" subtitle="This page cannot browse your machine or run downloaded code.">
            <ul className="space-y-1.5 text-xs leading-relaxed text-[var(--muted)]">
              <li>• Only public http(s) URLs are fetched; private hosts and non-web ports are blocked on the server.</li>
              <li>• Only free Wikipedia, DuckDuckGo, Google News, Hacker News and arXiv adapters are used.</li>
              <li>• Page size, read time, redirects, pages per session, and statements per page are capped.</li>
              <li>• Instructions found in page text are ignored; only topic-relevant statements are stored.</li>
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Live study activity" subtitle="Every real search, page open, and extraction step is shown.">
            {activities.length === 0 ? (
              <EmptyState title="No study session yet" description="Activate a study session to watch it search, read, and absorb information here." />
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {visibleActivities.slice(-50).reverse().map((activity) => (
                  <div key={activity.id} className="rounded border hairline bg-black/20 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs text-slate-200">{activity.message}</div>
                      <Badge tone={statusTone(activity.status)}>{activity.status}</Badge>
                    </div>
                    {activity.detail && <div className="mt-1 break-words font-mono text-[10px] leading-relaxed text-[var(--muted)]">{activity.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Absorbed knowledge"
            subtitle={studiedTopic ? `Findings retrieved for “${studiedTopic}”.` : "Findings will appear here after a study session."}
            action={findings.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => persistFindings(findings, studiedTopic || result?.topic || topic)}>
                Save all to knowledge base
              </Button>
            ) : undefined}
          >
            {findings.length === 0 ? (
              <EmptyState title="Nothing absorbed yet" description="Relevant statements from real pages will be listed here with their source and retrieval time." />
            ) : (
              <div className="space-y-3">
                {findings.map((finding, index) => (
                  <details key={`${finding.hit.url}-${index}`} className="rounded border hairline bg-black/20 p-3">
                    <summary className="cursor-pointer text-xs text-slate-200">
                      <span className="mr-2 font-mono text-cyan-400">[{index + 1}]</span>
                      {finding.hit.title}
                    </summary>
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="cyan">{finding.hit.source}</Badge>
                        {finding.headlineOnly && <Badge tone="amber">headline only</Badge>}
                        {finding.page?.fetchedAt && <span className="font-mono text-[10px] text-[var(--muted)]">Retrieved {finding.page.fetchedAt}</span>}
                      </div>
                      <a href={finding.hit.url} target="_blank" rel="noopener noreferrer" className="focus-ring block break-all font-mono text-[10px] text-cyan-400 hover:text-cyan-300">
                        {finding.hit.url}
                      </a>
                      <ul className="space-y-1.5 text-xs leading-relaxed text-slate-300">
                        {finding.sentences.map((statement, statementIndex) => (
                          <li key={statementIndex} className="border-l border-cyan-500/30 pl-2">“{statement}”</li>
                        ))}
                      </ul>
                      <Button size="sm" variant="ghost" onClick={() => persistFindings([finding], studiedTopic || result?.topic || topic)}>
                        Save finding
                      </Button>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
