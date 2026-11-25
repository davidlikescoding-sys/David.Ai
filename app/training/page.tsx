"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { estimateParams } from "@/engine/transformer";
import { PageHeader, Card, Button, Badge, Field, Input, Stat, ErrorBox, ProgressBar, ConfirmDialog, formatNumber } from "@/components/ui";
import { LossChart } from "@/components/LossChart";

function formatDuration(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function TrainingPage() {
  const {
    datasets, selectedDatasetIds, setSelectedDatasetIds, training, config, settings, updateSettings,
    modelReady, initModel, startTraining, pauseTraining, resumeTraining, stopTraining,
    saveCheckpoint, experiments, createExperiment, combinedStats, modelVersions,
    wordModelReady, wordVocabSize, wordSteps, wordLoss, wordTraining, initWordModel, trainWordModel,
  } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkpointName, setCheckpointName] = useState("");
  const [confirmInit, setConfirmInit] = useState(false);
  const [wordStepsInput, setWordStepsInput] = useState(300);

  const selected = datasets.filter((d) => selectedDatasetIds.includes(d.id));
  const stats = combinedStats(selectedDatasetIds, config.blockSize);
  const progress = training.totalSteps ? Math.min(100, (training.step / training.totalSteps) * 100) : 0;
  const running = training.status === "running";
  const active = running || training.status === "paused";
  const params = modelReady ? estimateParams(config) : 0;
  const best = training.lossHistory.length ? Math.min(...training.lossHistory.map((h) => h.loss)) : null;

  const act = (fn: () => void) => { setError(null); setNotice(null); try { fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };

  const doInit = () => act(() => {
    if (!selected.length) throw new Error("Select at least one dataset first.");
    initModel(config, selectedDatasetIds);
    setNotice("Fresh model initialized with random weights and dataset vocabulary.");
  });
  const doStart = () => act(() => {
    if (!modelReady) initModel(config, selectedDatasetIds);
    startTraining(selectedDatasetIds, settings.trainingSteps);
    setNotice(null);
  });
  const doSave = () => act(() => {
    const meta = saveCheckpoint(checkpointName || `Step ${training.step} — ${new Date().toLocaleTimeString()}`);
    setCheckpointName("");
    setNotice(`Checkpoint "${meta.name}" saved (${meta.sizeBytes.toLocaleString()} bytes of real weights).`);
  });
  const doWordInit = () => act(() => {
    const result = initWordModel();
    if (!result.ok) throw new Error(result.message);
    setNotice(`Word-level language model initialized: ${result.vocabSize} learned word tokens.`);
  });
  const doWordTrain = async () => {
    setError(null); setNotice(null);
    const result = await trainWordModel(wordStepsInput);
    if (!result.ok) setError(result.message); else setNotice(result.message);
  };
  const doExperiment = () => act(() => {
    if (!training.lossHistory.length) throw new Error("Train at least one step before recording an experiment.");
    const e = createExperiment(`Run ${experiments.length + 1} — ${new Date().toLocaleString()}`, `Config ${config.layers}L/${config.heads}H/${config.dModel}d, ${selected.length} dataset(s)`);
    setNotice(`Experiment "${e.name}" recorded with ${e.results.length} loss measurements.`);
  });

  return (
    <>
      <PageHeader
        eyebrow="Experiment Runner"
        title="Training Laboratory"
        description="Real mini-batch gradient descent with backpropagation and Adam. The loop yields to the browser so the interface stays responsive."
        actions={<Badge tone={running ? "cyan" : modelReady ? "green" : "neutral"}>{running ? "training" : modelReady ? "model ready" : "no model"}</Badge>}
      />

      <ErrorBox message={error} />
      {training.error && <ErrorBox message={training.error} />}
      {notice && <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Datasets" subtitle="Select the exact training corpus">
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {datasets.length === 0 && <p className="text-xs text-[var(--muted)]">No datasets. Add some in the Datasets page.</p>}
              {datasets.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded border hairline px-2.5 py-2 text-xs hover:border-cyan-500/30">
                  <input type="checkbox" checked={selectedDatasetIds.includes(d.id)} disabled={active} onChange={() => setSelectedDatasetIds(selectedDatasetIds.includes(d.id) ? selectedDatasetIds.filter((x) => x !== d.id) : [...selectedDatasetIds, d.id])} className="accent-cyan-500" />
                  <span className="min-w-0 flex-1 truncate" title={d.name}>{d.name}</span>
                  <span className="font-mono text-[10px] text-[var(--muted)]">{Array.from(d.content).length.toLocaleString()}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 border-t hairline pt-3 font-mono text-[10px] text-[var(--muted)]">
              <span>{selected.length} dataset(s)</span><span>{formatNumber(stats.tokens)} tokens · {formatNumber(stats.windows)} windows</span>
            </div>
          </Card>

          <Card title="Run Parameters" subtitle="Batch size and clipping apply live; learning rate applies on the next batch">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Batch size"><Input type="number" min="1" max="64" value={settings.batchSize} onChange={(e) => updateSettings({ batchSize: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Total steps"><Input type="number" min="1" max="100000" value={settings.trainingSteps} disabled={active} onChange={(e) => updateSettings({ trainingSteps: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Learning rate"><Input type="number" step="0.0001" min="0.00001" value={settings.learningRate} onChange={(e) => updateSettings({ learningRate: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Grad clip"><Input type="number" min="0" step="0.5" value={settings.gradientClip} onChange={(e) => updateSettings({ gradientClip: Number(e.target.value) })} className="font-mono text-xs" /></Field>
            </div>
            <div className="mt-3 space-y-1 border-t hairline pt-3 font-mono text-[10px] text-[var(--muted)]">
              <div>Model: {config.layers}L · {config.heads}H · {config.dModel}d · ctx {config.blockSize} · {formatNumber(params)} params</div>
              <div>Live LR: {training.learningRate || settings.learningRate} · effective batch: {training.batchSize || settings.batchSize}</div>
            </div>
          </Card>

          <Card title="Controls">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => modelReady ? setConfirmInit(true) : doInit()} disabled={active}>Initialize</Button>
              {running ? (
                <Button variant="primary" onClick={() => act(pauseTraining)}>❚❚ Pause</Button>
              ) : training.status === "paused" ? (
                <Button variant="primary" onClick={() => act(resumeTraining)} disabled={!modelReady}>▶ Resume</Button>
              ) : (
                <Button variant="primary" onClick={doStart}>{training.step > 0 ? "▶ Continue" : "▶ Start"}</Button>
              )}
              <Button variant="danger" onClick={() => act(stopTraining)} disabled={!active}>■ Stop</Button>
              <Button variant="secondary" onClick={doExperiment} disabled={!training.lossHistory.length}>Record Run</Button>
            </div>
          </Card>

          <Card title="Generative Word Model" subtitle="Real trainable language-model parameters used for AI Chat answers">
            <div className="space-y-2 font-mono text-[10px] text-[var(--muted)]">
              <div>Status: {wordModelReady ? `ready · ${wordVocabSize} words · step ${wordSteps}` : "not initialized"}</div>
              <div>Loss: {wordLoss === null ? "—" : wordLoss.toFixed(4)} · perplexity: {wordLoss === null ? "—" : Math.exp(Math.min(20, wordLoss)).toFixed(1)}</div>
              <div className="leading-relaxed">Built from your datasets, dictionary definitions, knowledge, memories and approved corrections. Q&amp;A examples use the same Context/User/DavidAI prompt format as chat, so the model learns to condition on retrieved evidence. These are training examples, not runtime rules.</div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="w-24"><Field label="Steps"><Input type="number" min={1} max={2000} value={wordStepsInput} onChange={(e) => setWordStepsInput(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))} className="font-mono text-xs" /></Field></div>
              <Button variant="outline" onClick={doWordInit} disabled={wordTraining}>Initialize</Button>
              <Button variant="primary" onClick={() => void doWordTrain()} disabled={wordTraining}>{wordTraining ? "Training…" : "Train words"}</Button>
            </div>
            <p className="mt-2 font-mono text-[9px] leading-relaxed text-slate-600">Training updates real weights and saves a separate local checkpoint. Feedback alone never changes weights.</p>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Step" value={formatNumber(training.step)} suffix={training.totalSteps ? `/ ${formatNumber(training.totalSteps)}` : undefined} tone="text-cyan-300" />
            <Stat label="Loss" value={training.loss === null ? "—" : training.loss.toFixed(4)} tone={training.loss !== null ? "text-cyan-300" : undefined} />
            <Stat label="Validation" value={training.validationLoss === null ? "—" : training.validationLoss.toFixed(4)} tone={training.validationLoss !== null ? "text-emerald-300" : undefined} />
            <Stat label="Perplexity" value={training.loss === null ? "—" : Math.exp(Math.min(20, training.loss)).toFixed(1)} tone={training.loss !== null ? "text-cyan-300" : undefined} />
            <Stat label="Model Version" value={modelVersions.length ? `v${Math.max(...modelVersions.map((v) => v.version))}` : "v0"} />
            <Stat label="Pass" value={training.samples ? training.epoch.toFixed(2) : "—"} suffix={training.samples ? "/ epoch" : undefined} />
            <Stat label="Elapsed" value={formatDuration(training.elapsedMs)} />
            <Stat label="Tokens Seen" value={formatNumber(training.tokensSeen)} />
            <Stat label="Steps / sec" value={training.stepsPerSecond ? training.stepsPerSecond.toFixed(2) : "—"} />
            <Stat label="Est. Remaining" value={formatDuration(training.etaMs)} />
            <Stat label="Grad Norm" value={training.gradNorm === null ? "—" : training.gradNorm.toFixed(3)} />
          </div>

          <Card title="Training Progress" subtitle={`Status: ${training.status} · pass ${training.epoch.toFixed(2)} over ${formatNumber(training.samples)} windows`} action={<Badge tone={running ? "cyan" : "neutral"}>{progress.toFixed(1)}%</Badge>}>
            <ProgressBar value={progress} label="Training progress" />
            <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[10px] text-[var(--muted)]">
              <span>{formatNumber(training.step)} completed</span>
              <span>{formatNumber(Math.max(0, training.totalSteps - training.step))} remaining</span>
              <span>batch {training.batchSize || "—"} · LR {training.learningRate || settings.learningRate}</span>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Training Loss" subtitle="Plotted from actual forward-pass cross-entropy values">
              <LossChart history={training.lossHistory} />
            </Card>
            <Card title="Validation Loss" subtitle="Held-out text, measured without optimizer updates">
              <LossChart history={training.validationHistory} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Training History" subtitle="Measured values from this run">
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="rounded border hairline p-2"><div className="text-sm text-cyan-300">{training.lossHistory[0]?.loss.toFixed(4) ?? "—"}</div><div className="mono-label mt-1">first</div></div>
                <div className="rounded border hairline p-2"><div className="text-sm text-emerald-300">{best?.toFixed(4) ?? "—"}</div><div className="mono-label mt-1">best</div></div>
                <div className="rounded border hairline p-2"><div className="text-sm text-cyan-300">{training.loss?.toFixed(4) ?? "—"}</div><div className="mono-label mt-1">latest</div></div>
              </div>
              <p className="mt-3 text-[11px] text-[var(--muted)]">{training.lossHistory.length} measured step(s). Estimated remaining time uses the average of the last {Math.min(12, training.step > 0 ? training.step : 0)} step durations.</p>
            </Card>
            <Card title="Training Logs" subtitle="Chronological run events" className="min-h-[180px]">
              {training.logs.length === 0 ? <p className="text-xs text-[var(--muted)]">No events yet.</p> : (
                <div className="max-h-44 space-y-1.5 overflow-y-auto font-mono text-[10px]">
                  {training.logs.map((l) => (
                    <div key={l.id} className="flex gap-2 border-b hairline pb-1 last:border-0">
                      <span className="text-[var(--muted)]">{new Date(l.timestamp).toLocaleTimeString()}</span>
                      <span className={l.level === "error" ? "text-red-300" : l.level === "warning" ? "text-amber-300" : l.level === "success" ? "text-emerald-300" : "text-slate-300"}>{l.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card title="Save & Continue" subtitle="Checkpoints contain real configuration, vocabulary and weights">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1"><Field label="Checkpoint name"><Input value={checkpointName} onChange={(e) => setCheckpointName(e.target.value)} placeholder={`Step ${training.step}`} /></Field></div>
              <Button variant="primary" onClick={doSave} disabled={!modelReady}>Save Checkpoint</Button>
            </div>
            <p className="mt-3 font-mono text-[10px] text-[var(--muted)]">Autosave writes weights every 20 steps and on pause/stop/complete. Explicit checkpoints are immutable snapshots.</p>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmInit}
        title="Initialize a new model?"
        description="This replaces the current weights and resets the training step. Save a checkpoint first if you want to keep the current model."
        confirmLabel="Initialize"
        danger
        onCancel={() => setConfirmInit(false)}
        onConfirm={() => { setConfirmInit(false); doInit(); }}
      />
    </>
  );
}
