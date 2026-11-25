"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { ASSISTANT_MODES, type AssistantMode } from "@/lib/types";
import type { BrainStatus } from "@/lib/brain/types";
import { PageHeader, Card, Button, Field, Input, Select, Badge, ErrorBox, ConfirmDialog } from "@/components/ui";
import { ModelInfoPanel } from "@/components/ModelInfoPanel";

export default function SettingsPage() {
  const {
    settings, updateSettings, exportData, importData, resetApp, datasets, checkpoints, experiments,
    knowledge, modelReady, config, memories, feedback, corrections, trainingExamples, learningSessions, modelVersions,
  } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);
  const [brainStatusError, setBrainStatusError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/brain/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; status?: BrainStatus; error?: string };
        if (cancelled) return;
        if (!response.ok || !payload.ok || !payload.status) {
          setBrainStatus(null);
          setBrainStatusError(payload.error ?? `Brain status request failed (HTTP ${response.status}).`);
          return;
        }
        setBrainStatus(payload.status);
        setBrainStatusError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setBrainStatus(null);
        setBrainStatusError(e instanceof Error ? e.message : "Could not reach the local brain status endpoint.");
      });
    return () => { cancelled = true; };
  }, []);

  const doExport = () => {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `davidai-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice("Export downloaded. It contains datasets, model weights, checkpoints and settings.");
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try { importData(await file.text()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    if (importRef.current) importRef.current.value = "";
  };

  return (
    <>
      <PageHeader eyebrow="Application" title="Settings" description="Theme, storage, model defaults and full data portability. Preferences live in this browser; chat, memory and images are kept on this machine." />
      <ErrorBox message={error} />
      {notice && <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card title="Appearance" subtitle="Applied immediately">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Theme">
                <Select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as "dark" | "midnight" | "light" })}>
                  <option value="dark">Dark (charcoal)</option>
                  <option value="midnight">Midnight (obsidian)</option>
                  <option value="light">Light</option>
                </Select>
              </Field>
              <Field label="Density">
                <Select value={settings.density} onChange={(e) => updateSettings({ density: e.target.value as "comfortable" | "compact" })}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card title="Model Defaults" subtitle="Used when initializing or training models">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Learning rate"><Input type="number" step="0.0001" min="0.00001" max="1" value={settings.learningRate} onChange={(e) => updateSettings({ learningRate: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="LR schedule" hint="Cosine warms up then decays; constant keeps a fixed rate">
                <Select value={settings.lrSchedule ?? "cosine"} onChange={(e) => updateSettings({ lrSchedule: e.target.value as "constant" | "cosine" })}>
                  <option value="cosine">Cosine decay</option>
                  <option value="constant">Constant</option>
                </Select>
              </Field>
              <Field label="Dropout" hint="Applied only while training newly initialized models; 0 is off">
                <Input type="number" min="0" max="0.9" step="0.05" value={settings.dropout ?? 0} onChange={(e) => updateSettings({ dropout: Number(e.target.value) })} className="font-mono text-xs" />
              </Field>
              <Field label="Weight decay" hint="AdamW decoupled decay; 0 disables it. 0.01 is a sensible default for small local runs">
                <Input type="number" min="0" max="1" step="0.001" value={settings.weightDecay ?? 0.01} onChange={(e) => updateSettings({ weightDecay: Number(e.target.value) })} className="font-mono text-xs" />
              </Field>
              <Field label="Batch size"><Input type="number" min="1" max="64" value={settings.batchSize} onChange={(e) => updateSettings({ batchSize: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Training steps"><Input type="number" min="1" max="100000" value={settings.trainingSteps} onChange={(e) => updateSettings({ trainingSteps: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Gradient clip norm" hint="0 disables clipping; the engine caps this at 100"><Input type="number" min="0" max="100" step="0.5" value={settings.gradientClip} onChange={(e) => updateSettings({ gradientClip: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Generation temperature"><Input type="number" min="0" max="2" step="0.05" value={settings.temperature} onChange={(e) => updateSettings({ temperature: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Max response tokens" hint="Local engine supports up to 512"><Input type="number" min="1" max="512" value={settings.maxTokens} onChange={(e) => updateSettings({ maxTokens: Math.min(512, Number(e.target.value)) })} className="font-mono text-xs" /></Field>
              <Field label="Top-k sampling" hint="0 keeps the full vocabulary; smaller is more focused"><Input type="number" min="0" max="128" value={settings.topK ?? 0} onChange={(e) => updateSettings({ topK: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Top-p (nucleus)" hint="0.9 keeps the smallest likely token set; 1 disables"><Input type="number" min="0" max="1" step="0.05" value={settings.topP ?? 0.9} onChange={(e) => updateSettings({ topP: Number(e.target.value) })} className="font-mono text-xs" /></Field>
              <Field label="Repetition penalty" hint="1 disables; higher discourages repeated tokens"><Input type="number" min="1" max="3" step="0.05" value={settings.repetitionPenalty ?? 1.1} onChange={(e) => updateSettings({ repetitionPenalty: Number(e.target.value) })} className="font-mono text-xs" /></Field>
            </div>
            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.useKnowledge} onChange={(e) => updateSettings({ useKnowledge: e.target.checked })} className="accent-cyan-500" />
                Retrieve uploaded knowledge for chat answers
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.useMemory} onChange={(e) => updateSettings({ useMemory: e.target.checked })} className="accent-cyan-500" />
                Retrieve relevant long-term memories
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.useCorrections} onChange={(e) => updateSettings({ useCorrections: e.target.checked })} className="accent-cyan-500" />
                Retrieve approved corrections
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.useGroundedAnswers} onChange={(e) => updateSettings({ useGroundedAnswers: e.target.checked })} className="accent-cyan-500" />
                Allow quoting retrieved local evidence when the word model is untrained
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.autoSave} onChange={(e) => updateSettings({ autoSave: e.target.checked })} className="accent-cyan-500" />
                Autosave model weights during training
              </label>
              <Field label="Default AI mode" hint="The processing strategy used in Chat. Auto adapts per question; the other modes change retrieval depth, sampling, prompting and web use.">
                <Select value={settings.assistantMode} onChange={(e) => {
                  const mode = e.target.value as AssistantMode;
                  updateSettings({ assistantMode: mode, chatMode: mode === "sandbox" ? "experimental" : "grounded" });
                }}>
                  {ASSISTANT_MODES.map((mode) => <option key={mode} value={mode}>{mode[0].toUpperCase() + mode.slice(1)}</option>)}
                </Select>
              </Field>
              <Field label="Chat mode" hint="Sandbox mode labels its guesses as hypotheses and never changes data by itself">
                <Select value={settings.chatMode} onChange={(e) => updateSettings({ chatMode: e.target.value as "grounded" | "experimental" })}>
                  <option value="grounded">Normal · grounded and careful</option>
                  <option value="experimental">Sandbox · experimental hypotheses</option>
                </Select>
              </Field>
              <Field label="Answer engine" hint="The trained word-level network is the legacy fallback. Primary chat answers come from the installed local Qwen GGUF; Retrieval quotes local evidence when no model is available.">
                <Select value={settings.answerEngine} onChange={(e) => updateSettings({ answerEngine: e.target.value as "generative" | "retrieval" })}>
                  <option value="generative">Generative language model (trained weights)</option>
                  <option value="retrieval">Retrieval fallback (quote local evidence)</option>
                </Select>
              </Field>
              <Field label={`Sandbox creativity · ${settings.sandboxCreativity}%`} hint="Higher values show more hypothetical connections">
                <input type="range" min={0} max={100} step={5} value={settings.sandboxCreativity}
                  onChange={(e) => updateSettings({ sandboxCreativity: Number(e.target.value) })} className="w-full accent-cyan-500" />
              </Field>
              <Field label={`Experimental intensity · ${settings.sandboxIntensity}%`} hint="How many model continuations and how much deviation from local evidence Sandbox may explore">
                <input type="range" min={0} max={100} step={5} value={settings.sandboxIntensity}
                  onChange={(e) => updateSettings({ sandboxIntensity: Number(e.target.value) })} className="w-full accent-cyan-500" />
              </Field>
              <Field label="Sandbox experiment risk" hint="Controls how many simulated alternatives the Sandbox shows">
                <Select value={settings.sandboxRisk} onChange={(e) => updateSettings({ sandboxRisk: e.target.value as "low" | "medium" | "high" })}>
                  <option value="low">Low · conservative</option>
                  <option value="medium">Medium · more varied</option>
                  <option value="high">High · aggressive simulation</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card title="Storage" subtitle="Local browser storage usage">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Datasets", datasets.length], ["Checkpoints", checkpoints.length], ["Experiments", experiments.length], ["Knowledge", knowledge.length],
                ["Memories", memories.length], ["Feedback", feedback.length], ["Corrections", corrections.length], ["Examples", trainingExamples.length],
              ].map(([label, n]) => <div key={String(label)} className="rounded border hairline p-3"><div className="font-mono text-lg text-cyan-300">{n}</div><div className="mono-label mt-1">{label}</div></div>)}
            </div>
            <div className="mt-3 flex justify-between border-t hairline pt-3 font-mono text-[10px] text-[var(--muted)]">
              <span>MODEL {modelReady ? `LOADED · ${config.vocabSize} vocab` : "NONE"}</span>
              <span>{learningSessions.length} LEARNING SESSION(S)</span>
              <span>{modelVersions.length} VERSION(S)</span>
              <span>BACKEND localStorage</span>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Model & System Information" subtitle="Live facts from installed files and status checks — no invented specifications">
            <ModelInfoPanel />
          </Card>

          <Card title="Persistent Brain & Local Model" subtitle="Offline generation and permanent SQLite memory">
            {brainStatus ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Conversations", brainStatus.stats.conversations],
                    ["Messages", brainStatus.stats.messages],
                    ["Knowledge", brainStatus.stats.knowledgeEntries],
                    ["Documents", brainStatus.stats.documents],
                  ].map(([label, value]) => <div key={String(label)} className="rounded border hairline p-2"><div className="font-mono text-base text-cyan-300">{value}</div><div className="mono-label mt-1">{label}</div></div>)}
                </div>
                <div className="space-y-1 font-mono text-[10px] text-[var(--muted)]">
                  <div>DB · {brainStatus.databasePath}</div>
                  <div>INTEGRITY · {brainStatus.stats.integrity} · SCHEMA v{brainStatus.stats.schemaVersion}</div>
                  <div>LLAMA.CLI · {brainStatus.localModel.executableReady ? "READY" : "MISSING"} · GGUF {brainStatus.localModel.modelBytes} bytes · {brainStatus.localModel.modelReady ? "READY" : "INCOMPLETE"}</div>
                  <div>EMBEDDING · {brainStatus.localModel.embeddingReady ? "READY" : "NOT INSTALLED"} · {brainStatus.localModel.embeddingBytes} bytes</div>
                  <div>LAST BACKUP · {brainStatus.stats.lastBackupAt ?? "none yet"}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={brainStatus.ready ? "green" : "red"}>{brainStatus.ready ? "BRAIN READY" : "BRAIN ERROR"}</Badge>
                  <Badge tone={brainStatus.localModel.modelReady ? "green" : "amber"}>{brainStatus.localModel.modelReady ? "QWEN INSTALLED" : "QWEN NOT READY"}</Badge>
                </div>
              </div>
            ) : brainStatusError ? (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Could not read brain status: {brainStatusError}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">Reading local brain status…</p>
            )}
            <div className="mt-4 space-y-2 border-t hairline pt-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.useLocalLlm} onChange={(e) => updateSettings({ useLocalLlm: e.target.checked })} className="accent-cyan-500" />
                Use installed Qwen GGUF for chat answers
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.brainAutoSave} onChange={(e) => updateSettings({ brainAutoSave: e.target.checked })} className="accent-cyan-500" />
                Mirror every conversation into SQLite permanently
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.useSemanticRetrieval} onChange={(e) => updateSettings({ useSemanticRetrieval: e.target.checked })} className="accent-cyan-500" />
                Use MiniLM embeddings when available
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={settings.strictOfflineMemory} onChange={(e) => updateSettings({ strictOfflineMemory: e.target.checked })} className="accent-cyan-500" />
                Refuse to invent facts when local memory is empty
              </label>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-[var(--muted)]">Training neural weights stays explicit and separate. Chat autosave only writes conversations and extracted structured knowledge; it never retrains the word model.</p>
          </Card>

          <Card title="Data Export" subtitle="Download a JSON backup of the entire application state">
            <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">The export includes datasets, current model weights, checkpoints, experiments, knowledge, memories, feedback, corrections, training examples, learning sessions, model versions and settings.</p>
            <Button variant="primary" onClick={doExport}>Download Export</Button>
          </Card>

          <Card title="Data Import" subtitle="Restore from a DavidAI JSON export">
            <input ref={importRef} type="file" accept="application/json,.json" onChange={(e) => void doImport(e.target.files?.[0])} className="focus-ring mb-3 w-full rounded border border-dashed hairline bg-black/20 p-3 text-xs text-slate-400 file:mr-3 file:rounded file:border file:border-cyan-500/40 file:bg-cyan-500/10 file:px-3 file:py-1.5 file:text-cyan-300" />
            <p className="text-[11px] text-amber-300">Import overwrites existing local data and reloads the application.</p>
          </Card>

          <Card title="Reset Application" subtitle="Remove all locally stored data">
            <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">Deletes every dataset, checkpoint, experiment, knowledge entry, setting and the current model. This cannot be undone unless you exported first.</p>
            <Button variant="danger" onClick={() => setConfirmReset(true)}>Reset Everything</Button>
          </Card>

          <Card title="About">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-[var(--muted)]">Training engine</span><span className="font-mono">Local decoder Transformer (from scratch)</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Primary chat engine</span><span className="font-mono text-cyan-300">Qwen2.5 1.5B Instruct · local GGUF / llama.cpp</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Chat fallback</span><span className="font-mono">Trained word-level model / local retrieval</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">Image engine</span><span className="font-mono">Local stable-diffusion.cpp · SD 1.5 / LCM GGUF</span></div>
              <div className="flex justify-between"><span className="text-[var(--muted)]">External AI</span><span className="font-mono text-emerald-300">Not used at runtime</span></div>
            </div>
            <div className="mt-4"><Badge tone="cyan">Local brain · optional public web research</Badge></div>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">A legacy unused external-provider route remains in the source for historical tests; the app never calls it and no key is configured.</p>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Reset DavidAI?"
        description="This permanently deletes every dataset, checkpoint, experiment, knowledge entry, setting and the current model on this machine. Export first if you need a backup."
        confirmLabel="Delete all local data"
        danger
        onConfirm={() => { setConfirmReset(false); resetApp(); }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
