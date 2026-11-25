"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { estimateParams } from "@/engine/transformer";
import { PageHeader, Stat, Card, Badge, Button, formatNumber, timeAgo, EmptyState } from "@/components/ui";
import { MiniLossChart } from "@/components/LossChart";
import { learningStats } from "@/lib/learning";

export default function DashboardPage() {
  const {
    datasets, checkpoints, experiments, training, config, modelReady, activity, selectedDatasetIds,
    combinedStats, initModel, settings, knowledge, memories, feedback, corrections,
    trainingExamples, learningSessions, modelVersions,
    wordModelReady, wordParams, wordVocabSize, wordSteps, wordLoss,
  } = useStore();

  const selected = datasets.filter((d) => selectedDatasetIds.includes(d.id));
  const totalTokens = combinedStats(selectedDatasetIds, config.blockSize).tokens;
  const params = wordModelReady ? wordParams : modelReady ? estimateParams(config) : 0;
  const engineReady = wordModelReady || modelReady;
  const learning = learningStats({
    memories, feedback, corrections, examples: trainingExamples,
    sessions: learningSessions, versions: modelVersions,
  });

  const [error, setError] = useState<string | null>(null);
  const initialize = () => {
    setError(null);
    try {
      if (!selected.length) throw new Error("Select at least one dataset first.");
      initModel(config, selectedDatasetIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="System Overview"
        title="Dashboard"
        description="Live state of your local neural network, datasets and training runs. Chat, memory and image files live on this machine; browser storage is an additional cache."
        actions={
          <>
            <Button variant="outline" onClick={initialize} disabled={!selected.length}>Initialize legacy model</Button>
            <Link href="/training" className="focus-ring inline-flex items-center justify-center gap-2 rounded border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-sm font-medium text-cyan-300 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/25">Open Training Lab →</Link>
          </>
        }
      />

      {error && <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="surface rounded-md p-4">
          <div className="flex items-center justify-between"><span className="mono-label">Model Status</span>
            <span className={`h-2 w-2 rounded-full ${engineReady ? "bg-emerald-400 pulse-dot" : "bg-slate-600"}`} /></div>
          <div className="mt-3 font-mono text-lg font-semibold">{engineReady ? "READY" : "UNINITIALIZED"}</div>
          <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">{wordModelReady ? `Word model · step ${wordSteps}` : `${training.status} · step ${training.step}`}</div>
        </div>
        <Stat label="Parameters" value={formatNumber(params)} suffix={engineReady ? "trainable" : "—"} />
        <Stat label="Datasets" value={datasets.length} suffix={`${selected.length} selected`} />
        <Stat label="Training Tokens" value={formatNumber(totalTokens)} suffix="selected" />
        <Stat label="Training Steps" value={formatNumber(training.step)} suffix={training.totalSteps ? `/ ${formatNumber(training.totalSteps)}` : undefined} />
        <Stat label={wordModelReady ? "Chat Model Loss" : "Latest Loss"} value={(wordModelReady ? wordLoss : training.loss) === null ? "—" : (wordModelReady ? wordLoss : training.loss)!.toFixed(4)} tone={(wordModelReady ? wordLoss : training.loss) !== null ? "text-cyan-300" : undefined} />
        <Stat label="Checkpoints" value={checkpoints.length} suffix="saved" />
        <Stat label="Experiments" value={experiments.length} suffix="recorded" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Memories" value={learning.memories} suffix="saved" />
        <Stat label="Feedback" value={learning.feedback} suffix={`${learning.positive}+ / ${learning.negative}−`} />
        <Stat label="Approved Corrections" value={learning.approved} />
        <Stat label="Training Examples" value={learning.examples} />
        <Stat label="Model Version" value={`v${learning.version}`} suffix={learning.sessions ? `${learning.sessions} session(s)` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Training Loss" subtitle={training.lossHistory.length ? `${training.lossHistory.length} real measurements` : "No training measurements yet"} className="lg:col-span-2" action={<Badge tone="cyan">live</Badge>}>
          {training.lossHistory.length > 1 ? (
            <>
              <MiniLossChart history={training.lossHistory} />
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[var(--muted)]">
                <span>initial {training.lossHistory[0].loss.toFixed(4)}</span>
                <span>latest {training.lossHistory[training.lossHistory.length - 1].loss.toFixed(4)}</span>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-xs text-[var(--muted)]">Train the model to see an actual loss curve.</p>
          )}
        </Card>

        <Card title="Model Configuration" subtitle="Chat model first, legacy model below">
          {wordModelReady ? (
            <div className="mb-3 rounded border border-cyan-500/20 bg-cyan-500/5 p-3">
              <div className="mono-label mb-2 text-cyan-400">GENERATIVE CHAT MODEL</div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {[
                  ["PARAMS", formatNumber(wordParams)], ["VOCAB", formatNumber(wordVocabSize)],
                  ["STEP", formatNumber(wordSteps)], ["LOSS", wordLoss === null ? "—" : wordLoss.toFixed(4)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-[var(--muted)]">{k}</span><span className="text-slate-200">{v}</span></div>
                ))}
              </div>
            </div>
          ) : null}
          {modelReady ? (
            <div className="space-y-2 font-mono text-xs">
              <div className="mono-label mb-1">LEGACY CHARACTER MODEL</div>
              {[
                ["LAYERS", config.layers], ["HEADS", config.heads], ["HIDDEN DIM", config.dModel],
                ["CONTEXT", config.blockSize], ["FF DIM", config.dFF], ["VOCAB", config.vocabSize],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between border-b hairline pb-1.5 last:border-0">
                  <span className="text-[var(--muted)]">{k}</span><span className="text-slate-200">{v}</span>
                </div>
              ))}
            </div>
          ) : !wordModelReady ? (
            <EmptyState title="No model initialized" description="Choose datasets and initialize a fresh randomly-weighted network." />
          ) : (
            <p className="font-mono text-[10px] text-[var(--muted)]">Legacy character model is not loaded.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Recent Activity" subtitle="Last events in this workspace" className="lg:col-span-2">
          {activity.length === 0 ? <p className="py-4 text-xs text-[var(--muted)]">No activity recorded yet.</p> : (
            <div className="divide-y divide-[var(--border)]">
              {activity.slice(0, 7).map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    a.type === "success" ? "bg-emerald-400" : a.type === "error" ? "bg-red-400" : a.type === "warning" ? "bg-amber-400" : "bg-cyan-400"
                  }`} />
                  <div className="min-w-0 flex-1 text-xs text-slate-300">{a.message}</div>
                  <div className="shrink-0 font-mono text-[10px] text-[var(--muted)]">{timeAgo(a.timestamp)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Workspace Contents">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Datasets", datasets.length, "/datasets"],
                ["Knowledge", knowledge.length, "/knowledge"],
                ["Memory", learning.memories, "/memory"],
                ["Learning", learning.examples, "/learning"],
                ["Experiments", experiments.length, "/experiments"],
              ].map(([label, count, href]) => (
                <Link key={String(href)} href={String(href)} className="rounded border hairline p-3 hover:border-cyan-500/40">
                  <div className="font-mono text-lg text-cyan-300">{count}</div>
                  <div className="mt-1 text-[10px] text-[var(--muted)]">{label}</div>
                </Link>
              ))}
            </div>
          </Card>
          <Card title="Legacy Word Model" subtitle="From-scratch experiment, not the primary chat engine">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-[var(--muted)]">Architecture</span><span className="font-mono">Decoder Transformer (legacy)</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Tokenizer</span><span className="font-mono">Character-level</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Optimizer</span><span className="font-mono">Adam</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Backend</span><span className="font-mono">Browser JavaScript (legacy)</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Learning rate</span><span className="font-mono">{settings.learningRate}</span></div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
