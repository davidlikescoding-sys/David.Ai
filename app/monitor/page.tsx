"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { ActivityRun, TraceStage } from "@/lib/trace";
import { PageHeader, Card, Button, Badge, EmptyState } from "@/components/ui";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour12: false }) : iso;
}

function StageRow({ stage }: { stage: TraceStage }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border hairline bg-black/20">
      <button onClick={() => setOpen(!open)} className="focus-ring flex w-full items-start gap-3 px-3 py-2 text-left">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border hairline font-mono text-[9px] text-cyan-400">{stage.index}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-200">{stage.name}</span>
            <Badge tone={stage.status === "success" ? "green" : stage.status === "failed" ? "red" : "neutral"}>{stage.status}</Badge>
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--muted)]">{stage.action}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-slate-500">{stage.durationMs}ms</span>
        <span className="font-mono text-[10px] text-slate-600">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t hairline px-3 py-2.5">
          <div>
            <div className="mono-label mb-1">Timestamp</div>
            <div className="font-mono text-[10px] text-slate-400">{stage.startedAt} · {formatTime(stage.startedAt)}</div>
          </div>
          <div>
            <div className="mono-label mb-1">Sources accessed</div>
            <div className="flex flex-wrap gap-1">
              {stage.sources.length ? stage.sources.map((source, i) => (
                <span key={`${source}-${i}`} className="rounded border border-cyan-500/20 bg-cyan-500/5 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300">{source}</span>
              )) : <span className="font-mono text-[10px] text-slate-600">none</span>}
            </div>
          </div>
          <div>
            <div className="mono-label mb-1">Retrieved / produced</div>
            {stage.retrieved.length ? (
              <ul className="space-y-1">
                {stage.retrieved.map((item, i) => <li key={`${item}-${i}`} className="break-words rounded bg-black/30 px-2 py-1 font-mono text-[10px] leading-relaxed text-slate-400">{item}</li>)}
              </ul>
            ) : <div className="font-mono text-[10px] text-slate-600">nothing retrieved</div>}
          </div>
          {stage.note && <div className="rounded border hairline bg-black/20 px-2 py-1.5 text-[10px] leading-relaxed text-slate-400">{stage.note}</div>}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: ActivityRun }) {
  const [open, setOpen] = useState(false);
  const completed = run.stages.filter((s) => s.status === "success").length;
  const failed = run.stages.filter((s) => s.status === "failed").length;
  const skipped = run.stages.filter((s) => s.status === "skipped").length;
  return (
    <Card className="!p-0" title={run.label} subtitle={`${formatTime(run.startedAt)} · ${run.mode === "experimental" ? "Sandbox experiment" : "Normal answer"} · ${run.durationMs}ms`}
      action={<div className="flex items-center gap-2">
        <Badge tone={run.status === "running" ? "amber" : run.status === "failed" ? "red" : "green"}>{run.status}</Badge>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Collapse" : "Expand"}</Button>
      </div>}>
      <div className="flex flex-wrap gap-2 font-mono text-[10px] text-slate-500">
        <span>{run.stages.length} stages</span><span>{completed} ok</span>{failed > 0 && <span className="text-red-400">{failed} failed</span>}{skipped > 0 && <span>{skipped} skipped</span>}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">{run.stages.map((stage) => <StageRow key={stage.id} stage={stage} />)}</div>
          {run.reasoning && (
            <div className="rounded border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
              <div className="mono-label mb-2 text-cyan-400">User-readable reasoning summary</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mono-label mb-1">Important concepts</div>
                  <div className="flex flex-wrap gap-1">{run.reasoning.concepts.length ? run.reasoning.concepts.map((c, i) => <span key={`${c}-${i}`} className="rounded border hairline px-1.5 py-0.5 font-mono text-[9px] text-slate-300">{c}</span>) : <span className="font-mono text-[10px] text-slate-600">none identified</span>}</div>
                </div>
                <div>
                  <div className="mono-label mb-1">Selected approach</div>
                  <div className="text-[11px] text-cyan-300">{run.reasoning.selected}</div>
                </div>
              </div>
              <div className="mt-3">
                <div className="mono-label mb-1">Approaches considered</div>
                <ul className="space-y-1">
                  {run.reasoning.approaches.map((approach, i) => (
                    <li key={`${approach.name}-${i}`} className="flex items-start gap-2 text-[11px]">
                      <span className={approach.selected ? "text-emerald-400" : "text-slate-600"}>{approach.selected ? "✓" : "·"}</span>
                      <span><span className={approach.selected ? "text-slate-200" : "text-slate-400"}>{approach.name}</span> — <span className="text-[var(--muted)]">{approach.reason}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="mono-label mb-1">Uncertainties</div>
                  <ul className="space-y-1">{run.reasoning.uncertainties.length ? run.reasoning.uncertainties.map((u, i) => <li key={`${u}-${i}`} className="text-[10px] leading-relaxed text-amber-300/80">• {u}</li>) : <li className="font-mono text-[10px] text-slate-600">none recorded</li>}</ul>
                </div>
                <div>
                  <div className="mono-label mb-1">How the answer was constructed</div>
                  <p className="text-[10px] leading-relaxed text-slate-400">{run.reasoning.construction}</p>
                </div>
              </div>
            </div>
          )}
          {run.answer && <div className="rounded border hairline bg-black/20 p-3"><div className="mono-label mb-1">Delivered answer</div><p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300">{run.answer}</p></div>}
        </div>
      )}
    </Card>
  );
}

export default function MonitorPage() {
  const { traces, clearTraces, wordModelReady, wordSteps, wordVocabSize } = useStore();
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<ActivityRun[]>([]);
  const visible = useMemo(() => paused ? frozen : traces, [paused, frozen, traces]);
  const running = visible.filter((run) => run.status === "running").length;

  const togglePause = () => {
    if (!paused) setFrozen(traces.slice());
    setPaused(!paused);
  };

  return (
    <>
      <PageHeader eyebrow="Transparency" title="AI Activity Monitor"
        description="Every entry below is recorded around an operation that actually ran in DavidAI. Each stage shows its source, retrieved information, timing, status and result. Nothing is animated or invented."
        actions={<div className="flex flex-wrap items-center gap-2">
          <Badge tone={running ? "amber" : "green"}>{running ? `${running} RUNNING` : "IDLE"}</Badge>
          <Button size="sm" variant={paused ? "primary" : "outline"} onClick={togglePause}>{paused ? "Resume live view" : "Pause live view"}</Button>
          <Button size="sm" variant="danger" onClick={() => { clearTraces(); setFrozen([]); setPaused(false); }}>Clear log</Button>
        </div>} />

      {paused && <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">Live view is paused. Processing continues; this list will refresh when you resume.</div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card className="!p-3"><div className="mono-label">Logged runs</div><div className="mt-1 font-mono text-lg text-slate-100">{visible.length}</div></Card>
        <Card className="!p-3"><div className="mono-label">Recorded stages</div><div className="mt-1 font-mono text-lg text-slate-100">{visible.reduce((n, r) => n + r.stages.length, 0)}</div></Card>
        <Card className="!p-3"><div className="mono-label">Word model</div><div className="mt-1 font-mono text-xs text-slate-200">{wordModelReady ? `${wordVocabSize} words · step ${wordSteps}` : "not initialized"}</div></Card>
        <Card className="!p-3"><div className="mono-label">Trace storage</div><div className="mt-1 font-mono text-xs text-slate-200">local browser · last 24 runs</div></Card>
      </div>

      <Card title="Chronological activity" subtitle="Newest first · expand any run for full stage detail">
        {visible.length === 0 ? (
          <EmptyState title="No activity recorded yet" description="Send a message in AI Chat or run a Sandbox experiment. Real stages will appear here as they execute." />
        ) : (
          <div className="space-y-3">{visible.map((run) => <RunCard key={run.id} run={run} />)}</div>
        )}
      </Card>
    </>
  );
}
