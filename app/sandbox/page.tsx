"use client";

import { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import {
  datasetAnswers, findDatasetAnswers, groundedCandidates, isReadableText, retrieveLearningContext,
  type LocalAnswerResult,
} from "@/lib/learning";
import { documentsFromStore, retrieveContext } from "@/lib/rag";
import { retrieveDictionary } from "@/lib/dictionary";
import type { DictionaryCategory, ExperimentProposal, SandboxExperiment } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Stat, Textarea } from "@/components/ui";

interface SandboxResult {
  id: number;
  prompt: string;
  answer: string;
  mode: LocalAnswerResult["answerMode"];
  source: string;
  readable: boolean;
  contextCount: number;
  elapsedMs: number;
  error?: string;
}

const PRESETS = [
  { label: "Greeting correction", prompt: "Hello there", hint: "Approved correction should win" },
  { label: "Memory recall", prompt: "What is my preferred name?", hint: "Saved memory should win" },
  { label: "Dataset greeting", prompt: "Hello", hint: "Definition in your dataset" },
  { label: "Dataset definition", prompt: "What is a computer?", hint: "Definition in your dataset" },
  { label: "Unknown input", prompt: "quantum banana", hint: "Should show NO LOCAL ANSWER" },
  { label: "Knowledge lookup", prompt: "What is in my knowledge base?", hint: "Uploaded knowledge excerpts" },
];

const DEFAULT_BATCH = PRESETS.map((preset) => preset.prompt).join("\n");

function modeTone(mode: SandboxResult["mode"]): "green" | "amber" | "cyan" {
  if (mode === "grounded") return "green";
  if (mode === "fallback") return "amber";
  return "cyan";
}

export default function SandboxPage() {
  const {
    modelReady, activeConversationId, settings, datasets, knowledge, memories, corrections, dictionary,
    sandboxExperiments, generateAnswer, updateSettings, runSandboxExperiment, decideSandboxExperiment,
    deleteSandboxExperiment,
  } = useStore();

  const [prompt, setPrompt] = useState(PRESETS[0].prompt);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchText, setBatchText] = useState(DEFAULT_BATCH);
  const [batchResults, setBatchResults] = useState<SandboxResult[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [expName, setExpName] = useState("");
  const [expPrompt, setExpPrompt] = useState("What is a world?");
  const [strategy, setStrategy] = useState("combined");
  const [proposalEnabled, setProposalEnabled] = useState(false);
  const [proposalType, setProposalType] = useState<"dictionary" | "knowledge">("dictionary");
  const [proposalWord, setProposalWord] = useState("");
  const [proposalDefinition, setProposalDefinition] = useState("");
  const [proposalPos, setProposalPos] = useState<DictionaryCategory>("noun");
  const [proposalExample, setProposalExample] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalContent, setProposalContent] = useState("");
  const [lastExperiment, setLastExperiment] = useState<SandboxExperiment | null>(null);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const nextId = useRef(1);
  const batchAbortRef = useRef<AbortController | null>(null);

  const conversationId = activeConversationId ?? "sandbox";
  const entries = useMemo(
    () => datasetAnswers(datasets.map((dataset) => ({ title: dataset.name, content: dataset.content }))),
    [datasets],
  );

  const preview = useMemo(() => {
    const text = prompt.trim();
    if (!text) return null;
    const memoryItems = settings.useMemory
      ? retrieveLearningContext(text, { memories }, { conversationId, maxItems: 4, maxChars: 1400 })
      : [];
    const correctionItems = settings.useCorrections
      ? retrieveLearningContext(text, { corrections }, { maxItems: 4, maxChars: 1400 })
      : [];
    const datasetMatches = findDatasetAnswers(text, entries, 3);
    const dictionaryMatches = retrieveDictionary(text, dictionary);
    const knowledgeItems = settings.useKnowledge
      ? retrieveContext(text, documentsFromStore(datasets, knowledge), { maxChunks: 3, maxChars: 900 }).sources
      : [];
    const candidates = groundedCandidates({ memoryItems, correctionItems, knowledgeItems, datasetMatches });
    return { memoryItems, correctionItems, datasetMatches, dictionaryMatches, knowledgeItems, candidates };
  }, [prompt, settings.useMemory, settings.useCorrections, settings.useKnowledge, memories, corrections, datasets, knowledge, dictionary, conversationId, entries]);

  const approved = useMemo(
    () => corrections.filter((correction) => correction.status === "approved")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [corrections],
  );

  const toResult = (text: string, answer: LocalAnswerResult, id: number): SandboxResult => ({
    id,
    prompt: text,
    answer: answer.text,
    mode: answer.answerMode,
    source: answer.sources[0] ?? "local weights",
    readable: isReadableText(answer.text, 2),
    contextCount: answer.sources.length,
    elapsedMs: answer.elapsedMs,
  });

  const run = async (text: string) => {
    const clean = text.trim();
    if (!clean || batchRunning) return;
    if (!modelReady) {
      setError("Initialize a local model in the Training Lab first.");
      return;
    }
    setError(null);
    setPrompt(clean);
    setRunning(true);
    try {
      const answer = await generateAnswer(clean, conversationId, []);
      setResult(toResult(clean, answer, nextId.current++));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const runBatch = async () => {
    const lines = batchText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    if (!modelReady) {
      setError("Initialize a local model in the Training Lab first.");
      return;
    }
    setError(null);
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setBatchRunning(true);
    setBatchResults([]);
    try {
      for (const line of lines) {
        if (controller.signal.aborted) break;
        try {
          const answer = await generateAnswer(line, conversationId, [], controller.signal);
          if (controller.signal.aborted) break;
          const item = toResult(line, answer, nextId.current++);
          setBatchResults((prev) => [...prev, item]);
        } catch (e) {
          if (controller.signal.aborted) break;
          setBatchResults((prev) => [...prev, {
            id: nextId.current++, prompt: line, answer: "", mode: "fallback", source: "error",
            readable: false, contextCount: 0, elapsedMs: 0, error: e instanceof Error ? e.message : String(e),
          }]);
        }
      }
    } finally {
      batchAbortRef.current = null;
      setBatchRunning(false);
    }
  };

  const runExperiment = () => {
    if (!expPrompt.trim()) { setError("Enter a prompt for the experiment."); return; }
    let proposal: ExperimentProposal | undefined;
    if (proposalEnabled) {
      if (proposalType === "dictionary") {
        if (!proposalWord.trim()) { setError("A proposal word is required."); return; }
        proposal = { type: "dictionary", word: proposalWord, definition: proposalDefinition,
          partOfSpeech: proposalPos, example: proposalExample };
      } else {
        if (!proposalTitle.trim()) { setError("A proposal title is required."); return; }
        proposal = { type: "knowledge", title: proposalTitle, category: "Sandbox", content: proposalContent };
      }
    }
    try {
      setError(null);
      const experiment = runSandboxExperiment({
        name: expName, prompt: expPrompt, strategy, risk: settings.sandboxRisk,
        experimental: settings.sandboxExperimental, creativity: settings.sandboxCreativity, proposal,
      });
      setCompareB(compareA || experiment.id);
      setCompareA(experiment.id);
      setLastExperiment(experiment);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Local Testing"
        title="Sandbox"
        description="Probe the local model and its retrieval, then run isolated experiments with different reasoning strategies. Experiments are simulated against local data only: no external AI, no private files, no changes to chats or model weights unless you explicitly approve a proposal."
        actions={<Badge tone={modelReady ? "green" : "amber"}>{modelReady ? "LOCAL MODEL READY" : "NO MODEL"}</Badge>}
      />
      <ErrorBox message={error} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Dictionary words" value={dictionary.length} />
        <Stat label="Memories" value={memories.filter((m) => !m.supersededBy).length} />
        <Stat label="Approved corrections" value={approved.length} />
        <Stat label="Dataset answers" value={entries.length} />
        <Stat label="Knowledge entries" value={knowledge.filter((k) => k.content.trim()).length} />
        <Stat label="Experiments" value={sandboxExperiments.length} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card title="Quick Prompt" subtitle="Send one question and inspect exactly what happened.">
            <Field label="Your question">
              <Textarea
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void run(prompt); } }}
                placeholder="Ask something that is in your datasets, memory, or corrections…"
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="primary" loading={running} disabled={batchRunning || !prompt.trim()} onClick={() => void run(prompt)}>Run prompt</Button>
              <Button variant="ghost" size="sm" onClick={() => { setPrompt(""); setResult(null); }}>Clear</Button>
              {result && <Badge tone={modeTone(result.mode)}>{result.mode}</Badge>}
              {result && <Badge tone={result.readable ? "green" : "red"}>{result.readable ? "english words" : "unreadable"}</Badge>}
            </div>
            {result && (
              <div className="mt-4 rounded border hairline bg-black/20 p-3">
                <div className="mono-label mb-2 text-cyan-500/70">RESULT · #{result.id} · {result.elapsedMs} ms</div>
                <p className="text-sm leading-relaxed text-slate-100">{result.answer || "(empty answer)"}</p>
                <div className="mt-3 border-t hairline pt-2 font-mono text-[10px] text-[var(--muted)]">
                  SOURCE: {result.source} · CONTEXT ITEMS: {result.contextCount}
                </div>
                {result.error && <p className="mt-2 text-xs text-red-300">{result.error}</p>}
              </div>
            )}
          </Card>

          <Card title="Presets" subtitle="One-click scenarios covering every answer path.">
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={running || batchRunning}
                  onClick={() => void run(preset.prompt)}
                  className="focus-ring rounded border hairline bg-black/20 p-2.5 text-left transition-colors hover:border-cyan-500/40"
                >
                  <div className="text-xs text-slate-200">{preset.label}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-[var(--muted)]">{preset.hint}</div>
                  <div className="mt-1 truncate font-mono text-[10px] text-cyan-400/70">{preset.prompt}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Batch Runner" subtitle="Test many questions in one pass. One prompt per line.">
            <Field label="Prompts">
              <Textarea rows={7} value={batchText} onChange={(event) => setBatchText(event.target.value)} className="font-mono text-xs" />
            </Field>
            <div className="mt-3 flex items-center gap-2">
              <Button variant="primary" loading={batchRunning} disabled={running || !batchText.trim()} onClick={() => void runBatch()}>Run batch</Button>
              {batchRunning && <Button variant="danger" onClick={() => batchAbortRef.current?.abort()}>Cancel batch</Button>}
              <span className="font-mono text-[10px] text-[var(--muted)]">{batchText.split(/\r?\n/).filter((line) => line.trim()).length} prompts</span>
            </div>
            {batchResults.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded border hairline">
                <table className="w-full text-left text-xs">
                  <thead className="mono-label bg-black/20 text-[9px]">
                    <tr><th className="p-2">Prompt</th><th className="p-2">Answer</th><th className="p-2">Mode</th><th className="p-2">Source</th><th className="p-2">English</th></tr>
                  </thead>
                  <tbody>
                    {batchResults.map((item) => (
                      <tr key={item.id} className="border-t hairline align-top">
                        <td className="p-2 font-mono text-[10px] text-slate-300">{item.prompt}</td>
                        <td className="max-w-[320px] p-2 text-slate-100">{item.answer || item.error}</td>
                        <td className="p-2"><Badge tone={modeTone(item.mode)}>{item.mode}</Badge></td>
                        <td className="p-2 font-mono text-[9px] text-[var(--muted)]">{item.source}</td>
                        <td className="p-2"><Badge tone={item.readable ? "green" : "red"}>{item.readable ? "yes" : "no"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Experimental Lab" subtitle="Try reasoning strategies and alternative answers in isolation. Nothing here changes the main app unless you approve a proposal.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Experiment name"><Input value={expName} onChange={(event) => setExpName(event.target.value)} placeholder="e.g. Dictionary vs dataset" /></Field>
              <Field label="Risk level" hint="Saved as your sandbox default">
                <Select value={settings.sandboxRisk} onChange={(event) => updateSettings({ sandboxRisk: event.target.value as "low" | "medium" | "high" })}>
                  <option value="low">Low · conservative, one grounded answer</option>
                  <option value="medium">Medium · two varied alternatives</option>
                  <option value="high">High · all alternatives + recombination</option>
                </Select>
              </Field>
              <Field label="Reasoning strategy">
                <Select value={strategy} onChange={(event) => setStrategy(event.target.value)}>
                  <option value="combined">Combined evidence (default)</option>
                  <option value="dictionary-first">Dictionary first</option>
                  <option value="dataset-first">Dataset first</option>
                  <option value="grammar-first">Grammar first</option>
                  <option value="alternatives">Compare alternatives only</option>
                </Select>
              </Field>
              <Field label="Simulation prompt"><Input value={expPrompt} onChange={(event) => setExpPrompt(event.target.value)} placeholder="What is a world?" /></Field>
            </div>

            <div className="mt-3 grid gap-3 rounded border hairline bg-black/20 p-3 sm:grid-cols-[auto_minmax(0,1fr)]">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.sandboxExperimental}
                  onChange={(event) => updateSettings({ sandboxExperimental: event.target.checked })} className="accent-cyan-500" />
                Experimental thinking
              </label>
              <div>
                <div className="mb-1 flex justify-between font-mono text-[10px] text-[var(--muted)]">
                  <span>Creativity</span><span>{settings.sandboxCreativity}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={settings.sandboxCreativity}
                  onChange={(event) => updateSettings({ sandboxCreativity: Number(event.target.value) })}
                  className="w-full accent-cyan-500" />
              </div>
              <div>
                <div className="mb-1 flex justify-between font-mono text-[10px] text-[var(--muted)]">
                  <span>Experimental intensity</span><span>{settings.sandboxIntensity}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={settings.sandboxIntensity}
                  onChange={(event) => updateSettings({ sandboxIntensity: Number(event.target.value) })}
                  className="w-full accent-cyan-500" />
              </div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={proposalEnabled} onChange={(event) => setProposalEnabled(event.target.checked)} className="accent-cyan-500" />
              Include a proposed change (stays a draft until explicitly approved)
            </label>

            {proposalEnabled && (
              <div className="mt-3 rounded border hairline bg-black/20 p-3">
                <div className="mb-2 font-mono text-[10px] text-cyan-400/80">PROPOSAL</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={proposalType} onChange={(event) => setProposalType(event.target.value as "dictionary" | "knowledge")}>
                    <option value="dictionary">Add dictionary word</option>
                    <option value="knowledge">Add knowledge entry</option>
                  </Select>
                  {proposalType === "dictionary" ? (
                    <>
                      <Input value={proposalWord} onChange={(event) => setProposalWord(event.target.value)} placeholder="Word" />
                      <Input value={proposalDefinition} onChange={(event) => setProposalDefinition(event.target.value)} placeholder="Definition" className="sm:col-span-2" />
                      <Select value={proposalPos} onChange={(event) => setProposalPos(event.target.value as DictionaryCategory)}>
                        {(["noun", "verb", "adjective", "adverb", "pronoun", "article", "other"] as DictionaryCategory[]).map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                      </Select>
                      <Input value={proposalExample} onChange={(event) => setProposalExample(event.target.value)} placeholder="Example sentence" />
                    </>
                  ) : (
                    <>
                      <Input value={proposalTitle} onChange={(event) => setProposalTitle(event.target.value)} placeholder="Knowledge title" />
                      <Input value={proposalContent} onChange={(event) => setProposalContent(event.target.value)} placeholder="Knowledge content" className="sm:col-span-2" />
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button variant="primary" disabled={!expPrompt.trim()} onClick={runExperiment}>Run simulation</Button>
              <Badge tone={settings.sandboxRisk === "high" ? "red" : settings.sandboxRisk === "medium" ? "amber" : "green"}>{settings.sandboxRisk} risk</Badge>
            </div>

            {lastExperiment && (
              <div className="mt-4 rounded border hairline bg-black/20 p-3">
                <div className="mono-label mb-2 text-cyan-500/70">SIMULATION · {lastExperiment.name}</div>
                <p className="text-sm leading-relaxed text-slate-100">{lastExperiment.simulatedAnswer}</p>
                <div className="mt-2 text-[11px] text-[var(--muted)]">{lastExperiment.analysis}</div>
                {!!lastExperiment.knownFacts?.length && (
                  <div className="mt-3 border-t hairline pt-2">
                    <div className="mono-label mb-1 text-emerald-400/70">Known facts · verified local evidence</div>
                    <ul className="space-y-1 text-[11px] text-slate-300">
                      {lastExperiment.knownFacts.map((fact, index) => <li key={index} className="rounded bg-emerald-500/5 p-1.5">{fact}</li>)}
                    </ul>
                  </div>
                )}
                {!!lastExperiment.hypotheses?.length && (
                  <div className="mt-3 border-t hairline pt-2">
                    <div className="mono-label mb-1 text-amber-400/70">Hypotheses · not verified</div>
                    <ul className="space-y-1 text-[11px] text-slate-300">
                      {lastExperiment.hypotheses.map((hypothesis, index) => <li key={index} className="rounded bg-amber-500/5 p-1.5">{hypothesis}</li>)}
                    </ul>
                  </div>
                )}
                {lastExperiment.alternatives.length > 0 && (
                  <div className="mt-3 border-t hairline pt-2">
                    <div className="mono-label mb-1">Alternatives · {lastExperiment.alternatives.length}</div>
                    <ul className="space-y-1 text-[11px] text-slate-300">
                      {lastExperiment.alternatives.map((alt, index) => <li key={index} className="rounded bg-black/20 p-1.5">• {alt}</li>)}
                    </ul>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {lastExperiment.sources.map((source) => <Badge key={source} tone="cyan">{source}</Badge>)}
                </div>
                {lastExperiment.proposal && (
                  <div className="mt-3 border-t hairline pt-2 text-[11px] text-amber-300/80">
                    PROPOSAL PENDING: {lastExperiment.proposal.type === "dictionary"
                      ? `word "${lastExperiment.proposal.word}"` : `knowledge "${lastExperiment.proposal.title}"`}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Retrieval Preview" subtitle="What would be retrieved for the current prompt.">
            {!preview ? (
              <EmptyState title="No prompt yet" description="Type a question to see the exact local evidence that would be used." />
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="mono-label mb-1">Approved corrections · {preview.correctionItems.length}</div>
                  {preview.correctionItems.length ? preview.correctionItems.map((item) => (
                    <div key={item.id} className="mb-1 rounded border hairline bg-black/20 p-2 text-[11px] text-slate-300">{item.answer ?? item.content}</div>
                  )) : <div className="text-[var(--muted)]">none</div>}
                </div>
                <div>
                  <div className="mono-label mb-1">Memories · {preview.memoryItems.length}</div>
                  {preview.memoryItems.length ? preview.memoryItems.map((item) => (
                    <div key={item.id} className="mb-1 rounded border hairline bg-black/20 p-2 text-[11px] text-slate-300">{item.content}</div>
                  )) : <div className="text-[var(--muted)]">none</div>}
                </div>
                <div>
                  <div className="mono-label mb-1">Dataset answers · {preview.datasetMatches.length}</div>
                  {preview.datasetMatches.length ? preview.datasetMatches.map((item) => (
                    <div key={`${item.sourceTitle}:${item.question}`} className="mb-1 rounded border hairline bg-black/20 p-2 text-[11px] text-slate-300">
                      <span className="text-cyan-400/70">{item.sourceTitle} · </span>{item.answer}
                    </div>
                  )) : <div className="text-[var(--muted)]">none</div>}
                </div>
                <div>
                  <div className="mono-label mb-1">Dictionary · {preview.dictionaryMatches.length}</div>
                  {preview.dictionaryMatches.length ? preview.dictionaryMatches.map((match) => (
                    <div key={match.word.id} className="mb-1 rounded border hairline bg-black/20 p-2 text-[11px] text-slate-300">
                      <span className="text-cyan-400/70">{match.word.word} ({match.word.partOfSpeech}) · </span>{match.word.definition}
                    </div>
                  )) : <div className="text-[var(--muted)]">none</div>}
                </div>
                <div>
                  <div className="mono-label mb-1">Knowledge · {preview.knowledgeItems.length}</div>
                  {preview.knowledgeItems.length ? preview.knowledgeItems.map((item) => (
                    <div key={item.title} className="mb-1 rounded border hairline bg-black/20 p-2 text-[11px] text-slate-300">{item.title}</div>
                  )) : <div className="text-[var(--muted)]">none</div>}
                </div>
                <div className="border-t hairline pt-2 font-mono text-[10px] text-cyan-400/80">
                  GROUNDED CANDIDATES: {preview.candidates.length}
                </div>
              </div>
            )}
          </Card>

          <Card title="Correction Drill" subtitle="Re-test every mistake you corrected.">
            {!approved.length ? (
              <EmptyState title="No approved corrections" description="Approve a correction on the Learning System page, then retest it here." />
            ) : (
              <div className="space-y-2">
                {approved.map((correction) => (
                  <div key={correction.id} className="rounded border hairline bg-black/20 p-2.5">
                    <div className="text-xs text-slate-200">{correction.question}</div>
                    <div className="mt-1 text-[11px] text-emerald-300/80">✓ {correction.correctedAnswer}</div>
                    <div className="mt-0.5 truncate text-[10px] text-red-300/60" title={correction.originalAnswer}>✗ {correction.originalAnswer}</div>
                    <Button size="sm" variant="outline" className="mt-2" disabled={running || batchRunning} onClick={() => void run(correction.question)}>Retest</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Experiment History" subtitle="Drafts stay simulated. Only you can approve a proposal into the main app.">
            {!sandboxExperiments.length ? (
              <EmptyState title="No experiments yet" description="Run a simulation in the Experimental Lab to see it here." />
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {sandboxExperiments.map((experiment) => (
                  <div key={experiment.id} className="rounded border hairline bg-black/20 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs text-slate-200">{experiment.name}</div>
                      <Badge tone={experiment.status === "approved" ? "green" : experiment.status === "rejected" ? "red" : "amber"}>{experiment.status}</Badge>
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-[var(--muted)]">{experiment.strategy} · {experiment.risk} risk · {new Date(experiment.createdAt).toLocaleString()}</div>
                    <p className="mt-1 line-clamp-3 text-[11px] text-slate-300">{experiment.simulatedAnswer}</p>
                    {experiment.proposal && experiment.status === "draft" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button size="sm" variant="primary" onClick={() => decideSandboxExperiment(experiment.id, "approved")}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => decideSandboxExperiment(experiment.id, "rejected")}>Reject</Button>
                      </div>
                    )}
                    {!experiment.proposal && experiment.status === "draft" && (
                      <Button size="sm" variant="ghost" onClick={() => decideSandboxExperiment(experiment.id, "rejected")}>Mark reviewed</Button>
                    )}
                    <Button size="sm" variant="ghost" className="ml-1" onClick={() => deleteSandboxExperiment(experiment.id)}>Delete</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Compare experiments" subtitle="Select two saved simulations to inspect side by side">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={compareA} onChange={(event) => setCompareA(event.target.value)}>
                <option value="">Choose first…</option>
                {sandboxExperiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name}</option>)}
              </Select>
              <Select value={compareB} onChange={(event) => setCompareB(event.target.value)}>
                <option value="">Choose second…</option>
                {sandboxExperiments.map((experiment) => <option key={experiment.id} value={experiment.id}>{experiment.name}</option>)}
              </Select>
            </div>
            {compareA || compareB ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[compareA, compareB].map((id, index) => {
                  const experiment = sandboxExperiments.find((item) => item.id === id);
                  return (
                    <div key={index} className="rounded border hairline bg-black/20 p-3">
                      <div className="mono-label mb-2 text-cyan-500/70">{index === 0 ? "A" : "B"} · {experiment?.mode ?? "grounded"}</div>
                      {experiment ? (
                        <>
                          <div className="text-xs font-medium text-slate-100">{experiment.name}</div>
                          <div className="mt-1 font-mono text-[9px] text-[var(--muted)]">{experiment.strategy} · {experiment.risk} risk · {experiment.status}</div>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{experiment.simulatedAnswer}</p>
                          <div className="mt-2 font-mono text-[9px] text-[var(--muted)]">Alternatives: {experiment.alternatives.length} · Hypotheses: {experiment.hypotheses?.length ?? 0}</div>
                        </>
                      ) : <p className="text-[11px] text-[var(--muted)]">No experiment selected.</p>}
                    </div>
                  );
                })}
              </div>
            ) : <p className="mt-3 text-[11px] text-[var(--muted)]">Run a simulation, then pick two experiments above.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
