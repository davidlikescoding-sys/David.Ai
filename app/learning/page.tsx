"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { describeCorrectionChange, learningStats } from "@/lib/learning";
import {
  PageHeader, Card, Button, Badge, Input, Field, Stat, ErrorBox, ConfirmDialog, EmptyState, timeAgo,
} from "@/components/ui";
import { LossChart } from "@/components/LossChart";

export default function LearningPage() {
  const {
    memories, feedback, corrections, trainingExamples, learningSessions, modelVersions,
    checkpoints, training, settings, updateSettings, learningEdits,
    approveCorrection, rejectCorrection, deleteFeedback, startFeedbackTraining, trainWordModelFromFeedback,
    updateCorrection, updateTrainingExample,
    exportLearning, exportTrainingDataset, clearLearning,
  } = useStore();

  const [query, setQuery] = useState("");
  const [feedbackQuery, setFeedbackQuery] = useState("");
  const [steps, setSteps] = useState(settings.feedbackTrainingSteps);
  const [wordFeedbackBusy, setWordFeedbackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editCorrection, setEditCorrection] = useState<{ id: string; answer: string; explanation: string } | null>(null);
  const [editExample, setEditExample] = useState<{ id: string; question: string; answer: string } | null>(null);

  const stats = useMemo(() => learningStats({
    memories, feedback, corrections, examples: trainingExamples, sessions: learningSessions, versions: modelVersions,
  }), [memories, feedback, corrections, trainingExamples, learningSessions, modelVersions]);
  const latest = learningSessions.length ? learningSessions[learningSessions.length - 1] : null;
  const running = training.status === "running" || training.status === "paused";

  const filteredCorrections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return corrections
      .filter((c) => !needle || c.question.toLowerCase().includes(needle) || c.correctedAnswer.toLowerCase().includes(needle) || c.explanation.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [corrections, query]);

  const filteredFeedback = useMemo(() => {
    const needle = feedbackQuery.trim().toLowerCase();
    return feedback
      .filter((f) => !needle || f.userMessage.toLowerCase().includes(needle) || f.assistantResponse.toLowerCase().includes(needle) || f.correction.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [feedback, feedbackQuery]);

  const act = (fn: () => void) => {
    setError(null);
    setNotice(null);
    try { fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const retrainWordWithFeedback = async () => {
    setError(null);
    setNotice(null);
    setWordFeedbackBusy(true);
    try {
      const result = await trainWordModelFromFeedback(steps);
      setNotice(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWordFeedbackBusy(false);
    }
  };

  const download = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const checkpointName = (id?: string) => checkpoints.find((c) => c.id === id)?.name ?? id ?? "—";
  const askReason = () => window.prompt("Why is this learned information changing?", "User reviewed and corrected it")?.trim() || "User reviewed and corrected it";

  return (
    <>
      <PageHeader
        eyebrow="Feedback & Retraining"
        title="Learning System"
        description="Feedback is stored as evidence, not as truth. Only corrections you approve become retrieval items and training examples. Weights change only when you explicitly start a training session."
        actions={<Badge tone={stats.pending ? "amber" : "green"}>{stats.pending} pending review</Badge>}
      />
      <ErrorBox message={error} />
      {notice && <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Memories" value={stats.memories} />
        <Stat label="Feedback" value={stats.feedback} suffix={`${stats.positive}+ / ${stats.negative}−`} />
        <Stat label="Approved" value={stats.approved} suffix="corrections" />
        <Stat label="Training Examples" value={stats.examples} />
        <Stat label="Sessions" value={stats.sessions} suffix={`v${stats.version}`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Latest Training Loss" value={stats.latestLoss === null ? "—" : stats.latestLoss.toFixed(4)} tone="text-cyan-300" />
        <Stat label="Latest Validation Loss" value={stats.latestValidationLoss === null ? "—" : stats.latestValidationLoss.toFixed(4)} tone="text-emerald-300" />
        <Stat label="Current Model Version" value={stats.version ? `v${stats.version}` : "v0"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card title="Correction Database" subtitle={`${filteredCorrections.length} shown · ${corrections.length} total`}>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions, corrections or explanations…" className="mb-3 text-xs" />
            {filteredCorrections.length === 0 ? (
              <EmptyState title="No corrections yet" description="Use the Correction button under any DavidAI response. Corrections stay pending until you approve them." />
            ) : (
              <div className="max-h-[520px] space-y-2 overflow-y-auto">
                {filteredCorrections.map((c) => (
                  <div key={c.id} className="rounded border hairline bg-black/15 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-cyan-400">QUESTION</span>
                      <Badge tone={c.status === "approved" ? "green" : c.status === "rejected" ? "red" : "amber"}>{c.status}</Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-200">{c.question}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded border hairline bg-black/20 p-2">
                        <div className="mono-label mb-1">Original</div>
                        <p className="text-[11px] text-slate-400">{c.originalAnswer || "(empty)"}</p>
                      </div>
                      <div className="rounded border hairline bg-emerald-500/10 p-2">
                        <div className="mono-label mb-1 text-emerald-400">Corrected</div>
                        <p className="text-[11px] text-slate-200">{c.correctedAnswer}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--muted)]">{describeCorrectionChange(c)}</p>
                    {editCorrection?.id === c.id && (
                      <div className="mt-2 space-y-2 rounded border border-cyan-500/20 bg-cyan-500/[0.04] p-2">
                        <Field label="Corrected answer"><Input value={editCorrection.answer} onChange={(e) => setEditCorrection({ ...editCorrection, answer: e.target.value })} className="text-xs" /></Field>
                        <Field label="Explanation"><Input value={editCorrection.explanation} onChange={(e) => setEditCorrection({ ...editCorrection, explanation: e.target.value })} className="text-xs" /></Field>
                        <div className="flex gap-2">
                          <Button size="sm" variant="primary" onClick={() => act(() => {
                            updateCorrection(c.id, { correctedAnswer: editCorrection.answer, explanation: editCorrection.explanation }, askReason());
                            setEditCorrection(null);
                            setNotice("Correction updated in place. Its linked training example was updated with it; no duplicate rule was added.");
                          })}>Save change</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditCorrection(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[10px] text-[var(--muted)]">
                      <span>{timeAgo(c.createdAt)} · {new Date(c.createdAt).toLocaleString()}</span>
                      <span>{c.exampleId ? `example ${c.exampleId.slice(0, 8)}` : "no example"}{c.memoryId ? ` · memory ${c.memoryId.slice(0, 8)}` : ""}</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditCorrection({ id: c.id, answer: c.correctedAnswer, explanation: c.explanation })}>Edit learned answer</Button>
                    </div>
                    {c.status === "pending" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => act(() => { approveCorrection(c.id); setNotice("Correction approved. A real training example and a reviewed memory were created."); })}>Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => act(() => { rejectCorrection(c.id); setNotice("Correction rejected."); })}>Reject</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Feedback Records" subtitle={`${filteredFeedback.length} shown · ${feedback.length} total`}>
            <Input value={feedbackQuery} onChange={(e) => setFeedbackQuery(e.target.value)} placeholder="Search feedback…" className="mb-3 text-xs" />
            {filteredFeedback.length === 0 ? (
              <EmptyState title="No feedback yet" description="Rate any response in AI Chat. Feedback keeps the original question, answer, correction and timestamp." />
            ) : (
              <div className="max-h-[520px] space-y-2 overflow-y-auto">
                {filteredFeedback.map((f) => (
                  <div key={f.id} className="rounded border hairline bg-black/15 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone={f.rating === "helpful" ? "green" : "red"}>{{
                          helpful: "👍 Good", not_helpful: "👎 Not helpful", incorrect: "❌ Incorrect",
                          incomplete: "◐ Incomplete", gibberish: "⌁ Gibberish", too_complicated: "≋ Too complicated",
                          not_relevant: "↯ Not relevant",
                        }[f.rating] ?? f.rating}</Badge>
                        <Badge>{f.correction ? f.status : "recorded"}</Badge>
                      </div>
                      <span className="font-mono text-[10px] text-[var(--muted)]">{new Date(f.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--muted)]">USER: {f.userMessage}</p>
                    <p className="mt-1 text-[11px] text-slate-300">DAVIDAI: {f.assistantResponse}</p>
                    {f.issue && <p className="mt-1 text-[11px] text-amber-300/80">Issue: {f.issue}</p>}
                    {f.improvement && <p className="mt-1 text-[11px] text-cyan-300/80">Improvement: {f.improvement}</p>}
                    {f.explanation && <p className="mt-1 text-[11px] text-slate-400">Explanation: {f.explanation}</p>}
                    {f.correction && <p className="mt-1 text-[11px] text-emerald-300">Correction: {f.correction}</p>}
                    <div className="mt-2 flex justify-end">
                      <button onClick={() => act(() => { deleteFeedback(f.id); setNotice("Feedback record deleted."); })} className="focus-ring rounded px-1 font-mono text-[10px] text-slate-400 hover:text-red-300">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Training Examples" subtitle="Generated only from approved corrections">
            {trainingExamples.length === 0 ? (
              <EmptyState title="No training examples" description="Approve a correction to generate a real next-token training example." />
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {trainingExamples.map((e) => (
                  <div key={e.id} className="rounded border hairline bg-black/15 p-2">
                    <div className="flex justify-between gap-2 font-mono text-[10px] text-[var(--muted)]">
                      <span>{e.kind} · {e.hash}</span>
                      <span>{e.usedInSessionIds.length} session(s)</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300">Q: {e.question}</p>
                    <p className="mt-1 text-[11px] text-emerald-300">A: {e.answer}</p>
                    {editExample?.id === e.id && (
                      <div className="mt-2 space-y-2 rounded border border-cyan-500/20 bg-cyan-500/[0.04] p-2">
                        <Field label="Question"><Input value={editExample.question} onChange={(ev) => setEditExample({ ...editExample, question: ev.target.value })} className="text-xs" /></Field>
                        <Field label="Answer"><Input value={editExample.answer} onChange={(ev) => setEditExample({ ...editExample, answer: ev.target.value })} className="text-xs" /></Field>
                        <div className="flex gap-2">
                          <Button size="sm" variant="primary" onClick={() => act(() => {
                            updateTrainingExample(e.id, { question: editExample.question, answer: editExample.answer }, askReason());
                            setEditExample(null);
                            setNotice("Training example updated in place. Train again for weights to reflect the change.");
                          })}>Save change</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditExample(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                    <div className="mt-2"><Button size="sm" variant="ghost" onClick={() => setEditExample({ id: e.id, question: e.question, answer: e.answer })}>Edit example</Button></div>
                    <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-words font-mono text-[9px] text-slate-500">{e.text}</pre>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Retrain With Feedback" subtitle="Explicit, backed up, real gradient descent">
            <div className="space-y-3">
              <Field label="Training steps" hint={`Recommended: ${settings.feedbackTrainingSteps} steps`}>
                <Input type="number" min="1" max="10000" value={steps} onChange={(e) => {
                  const value = Math.max(1, Math.min(10000, Number(e.target.value) || 1));
                  setSteps(value);
                  updateSettings({ feedbackTrainingSteps: value });
                }} className="font-mono text-xs" />
              </Field>
              <div className="rounded border hairline bg-black/20 p-2 font-mono text-[10px] text-[var(--muted)]">
                {stats.approved} approved correction(s) · {stats.examples} example(s) available
              </div>
              <Button
                variant="primary"
                className="w-full"
                disabled={running || stats.examples === 0}
                onClick={() => act(() => {
                  startFeedbackTraining(steps);
                  setNotice("Feedback training started. The current model was backed up before retraining.");
                })}
              >Start Feedback Training</Button>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                This builds a fresh tokenizer from selected datasets, approved examples, memories and knowledge, then trains real weights with backpropagation. A checkpoint backup is saved first. Feedback alone never changes weights.
              </p>
              {latest?.backupCheckpointId && (
                <p className="font-mono text-[10px] text-cyan-400">Last backup: {checkpointName(latest.backupCheckpointId)}</p>
              )}
            </div>
          </Card>

          <Card title="Retrain Generative Word Model" subtitle="Feedback becomes real model training — explicit only">
            <div className="space-y-3">
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                The generative model used by AI Chat learns from approved corrections only when you start this action. It rebuilds from the current local corpus, which already includes approved corrections, memories, knowledge and datasets, then runs real gradient descent. This replaces the previous word-model checkpoint; the character model and all checkpoints are unchanged.
              </p>
              <div className="rounded border hairline bg-black/20 p-2 font-mono text-[10px] text-[var(--muted)]">
                {stats.approved} approved correction(s) · {steps} training step(s)
              </div>
              <Button
                variant="outline"
                className="w-full"
                disabled={wordFeedbackBusy || running || stats.approved === 0}
                loading={wordFeedbackBusy}
                onClick={() => { void retrainWordWithFeedback(); }}
              >Retrain Word Model With Feedback</Button>
            </div>
          </Card>

          <Card title="Loss Curves" subtitle="Measured on the latest feedback training session">
            {latest && latest.lossHistory.length > 1 ? (
              <div className="space-y-4">
                <div>
                  <div className="mono-label mb-1 text-cyan-400">Training loss</div>
                  <LossChart history={latest.lossHistory} height={180} />
                </div>
                <div>
                  <div className="mono-label mb-1 text-emerald-400">Validation loss</div>
                  {latest.validationHistory.length > 1
                    ? <LossChart history={latest.validationHistory} height={180} />
                    : <p className="py-6 text-center text-xs text-[var(--muted)]">Not enough held-out examples for a validation curve.</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-[var(--muted)]">
                  <span>final train {latest.finalLoss?.toFixed(4) ?? "—"}</span>
                  <span>final val {latest.finalValidationLoss?.toFixed(4) ?? "—"}</span>
                </div>
              </div>
            ) : (
              <EmptyState title="No training curves yet" description="Approve a correction, then start feedback training to see real training and validation loss." />
            )}
          </Card>

          <Card title="Model Versions">
            {modelVersions.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No feedback-trained versions yet.</p>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {[...modelVersions].reverse().map((v) => (
                  <div key={v.id} className="rounded border hairline bg-black/15 p-2 font-mono text-[10px]">
                    <div className="flex justify-between"><span className="text-cyan-300">v{v.version}</span><span>{timeAgo(v.createdAt)}</span></div>
                    <div className="mt-1 text-[var(--muted)]">step {v.step} · train {v.loss?.toFixed(4) ?? "—"} · val {v.validationLoss?.toFixed(4) ?? "—"}</div>
                    <div className="mt-1 text-[var(--muted)]">{v.exampleIds.length} example(s) · {checkpointName(v.checkpointId)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Learning Mechanics" subtitle="Remembering, retrieving and training are different operations">
            <div className="space-y-2 text-[11px] leading-relaxed text-[var(--muted)]">
              <p><span className="text-cyan-300">Remembering</span> saves or updates a local record (memory, correction, training example, dictionary entry).</p>
              <p><span className="text-cyan-300">Retrieving</span> finds relevant records at answer time. It reads data; it never changes model weights.</p>
              <p><span className="text-cyan-300">Training</span> runs real gradient descent and saves new weights. Only explicit training changes the network.</p>
            </div>
          </Card>

          <Card title="Learning History" subtitle="What changed, when and why">
            {learningEdits.length === 0 ? <p className="text-xs text-[var(--muted)]">No edits recorded yet. Editing a correction or training example records the old value, new value and reason here.</p> : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {learningEdits.map((edit) => (
                  <div key={edit.id} className="rounded border hairline bg-black/15 p-2 font-mono text-[10px]">
                    <div className="flex justify-between"><span className="text-cyan-400">{edit.targetType}/{edit.field}</span><span className="text-slate-600">{timeAgo(edit.createdAt)}</span></div>
                    <div className="mt-1 break-words text-slate-400"><span className="text-red-300">− {edit.before.slice(0, 90)}</span></div>
                    <div className="break-words text-emerald-300">+ {edit.after.slice(0, 90)}</div>
                    <div className="mt-1 text-slate-500">Why: {edit.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Export & Clear">
            <div className="space-y-2">
              <Button variant="secondary" className="w-full" onClick={() => { download(`davidai-learning-${new Date().toISOString().slice(0, 10)}.json`, exportLearning()); setNotice("Learning data exported."); }}>Export Learning Data</Button>
              <Button variant="secondary" className="w-full" onClick={() => { download(`davidai-training-data-${new Date().toISOString().slice(0, 10)}.json`, exportTrainingDataset()); setNotice("Training dataset exported."); }}>Export Training Dataset</Button>
              <Button variant="danger" className="w-full" onClick={() => setConfirmClear(true)}>Clear Learning Data</Button>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">Clearing removes memories, feedback, corrections, examples, sessions and version records. It does not rewrite model weights.</p>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all learning data?"
        description="This permanently deletes saved memories, feedback, corrections, training examples, sessions and model version records from this browser. Export first if you need a backup."
        confirmLabel="Clear"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { clearLearning(); setConfirmClear(false); setNotice("Learning data cleared. Model weights were not changed."); }}
      />
    </>
  );
}
