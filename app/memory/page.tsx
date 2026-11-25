"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { memoryCategory, type MemoryCategory, type MemoryKind } from "@/lib/types";
import {
  PageHeader, Card, Button, Badge, Input, Textarea, Field, Select, EmptyState, ErrorBox, ConfirmDialog, Stat, timeAgo,
} from "@/components/ui";
import BrainDashboard from "@/components/brain-dashboard";

const KINDS: Array<{ value: MemoryKind; label: string }> = [
  { value: "explicit", label: "Explicit" },
  { value: "fact", label: "Fact" },
  { value: "preference", label: "Preference" },
  { value: "correction", label: "Correction" },
  { value: "short_term", label: "Short-term (current conversation)" },
  { value: "vocabulary", label: "Vocabulary" },
  { value: "learning", label: "Learning" },
  { value: "knowledge", label: "Knowledge" },
];

const CATEGORY_FILTERS: Array<{ value: "all" | MemoryCategory; label: string }> = [
  { value: "all", label: "All memories" },
  { value: "short_term", label: "Short-term" },
  { value: "long_term", label: "Long-term" },
  { value: "vocabulary", label: "Vocabulary" },
  { value: "learning", label: "Learning" },
  { value: "knowledge", label: "Knowledge" },
];

export default function MemoryPage() {
  const { memories, conversations, activeConversationId, addMemory, updateMemory, deleteMemory } = useStore();
  const [query, setQuery] = useState("");
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<MemoryKind>("explicit");
  const [categoryFilter, setCategoryFilter] = useState<"all" | MemoryCategory>("all");
  const [globalScope, setGlobalScope] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editKind, setEditKind] = useState<MemoryKind>("explicit");
  const [editGlobal, setEditGlobal] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return memories
      .filter((m) => categoryFilter === "all" || memoryCategory(m.kind) === categoryFilter)
      .filter((m) => !needle || m.content.toLowerCase().includes(needle) || m.kind.includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [memories, query, categoryFilter]);

  const active = memories.filter((m) => !m.supersededBy);
  const act = (fn: () => void) => {
    setError(null);
    setNotice(null);
    try { fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const scopeLabel = (conversationId: string | null) => {
    if (!conversationId) return "User-wide";
    return conversations.find((c) => c.id === conversationId)?.title ?? "One conversation";
  };

  return (
    <>
      <PageHeader
        eyebrow="Continuous Learning"
        title="Memory Manager"
        description="Five persistent memory categories: short-term, long-term, vocabulary, learning and knowledge. Useful facts and retrieved knowledge are saved automatically; ordinary chat messages are not."
        actions={<Badge tone="cyan">{active.length} active</Badge>}
      />
      <ErrorBox message={error} />
      {notice && <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active Memories" value={active.length} />
        <Stat label="Short-term" value={active.filter((m) => memoryCategory(m.kind) === "short_term").length} />
        <Stat label="Long-term" value={active.filter((m) => memoryCategory(m.kind) === "long_term").length} />
        <Stat label="Vocabulary" value={active.filter((m) => memoryCategory(m.kind) === "vocabulary").length} />
        <Stat label="Learning" value={active.filter((m) => memoryCategory(m.kind) === "learning").length} />
        <Stat label="Knowledge" value={active.filter((m) => memoryCategory(m.kind) === "knowledge").length} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Add Memory" subtitle="Saved locally and retrieved by relevance">
            <div className="space-y-3">
              <Field label="Memory">
                <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Example: My preferred name is Sam." className="text-xs" />
              </Field>
              <Field label="Type">
                <Select value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)}>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={globalScope} onChange={(e) => setGlobalScope(e.target.checked)} className="accent-cyan-500" />
                Apply across all conversations
              </label>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => act(() => {
                  const memory = addMemory({
                    content, kind,
                    conversationId: globalScope ? null : activeConversationId,
                    source: "manual",
                  });
                  setContent("");
                  setNotice(memory.recallCount === 0 && memories.some((m) => m.hash === memory.hash)
                    ? "That memory already exists."
                    : "Memory saved.");
                })}
                disabled={!content.trim()}
              >Save Memory</Button>
            </div>
          </Card>

          <Card title="Deduplication" subtitle="How duplicates are handled">
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              Memories are compared using normalized text. Saving the same fact twice reuses the existing entry. Approved corrections can mark older relevant memories as superseded so they are no longer retrieved.
            </p>
          </Card>
        </div>

        <Card title="Saved Memories" subtitle={`${filtered.length} shown · ${memories.length} total`}>
          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories…" className="text-xs" />
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "all" | MemoryCategory)}>
              {CATEGORY_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </Select>
            {query && <Button variant="ghost" size="sm" onClick={() => setQuery("")}>Clear</Button>}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="No memories found" description="Ask DavidAI to remember something, state a preference, or add a memory manually." />
          ) : (
            <div className="max-h-[620px] space-y-2 overflow-y-auto">
              {filtered.map((memory) => (
                <div key={memory.id} className="rounded border hairline bg-black/15 p-3">
                  {editingId === memory.id ? (
                    <div className="space-y-2">
                      <Textarea rows={3} value={editContent} onChange={(e) => setEditContent(e.target.value)} className="text-xs" />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select value={editKind} onChange={(e) => setEditKind(e.target.value as MemoryKind)}>
                          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </Select>
                        <label className="flex items-center gap-2 text-[11px] text-slate-300">
                          <input type="checkbox" checked={editGlobal} onChange={(e) => setEditGlobal(e.target.checked)} className="accent-cyan-500" />
                          User-wide scope
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => act(() => {
                          updateMemory(memory.id, {
                            content: editContent,
                            kind: editKind,
                            conversationId: editGlobal ? null : (memory.conversationId ?? activeConversationId),
                          });
                          setEditingId(null);
                          setNotice("Memory updated.");
                        })} disabled={!editContent.trim()}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="max-w-[75%] text-[13px] text-slate-200">{memory.content}</p>
                        <div className="flex gap-1">
                          <Badge tone={memory.kind === "preference" || memory.kind === "knowledge" ? "cyan"
                            : memory.kind === "correction" || memory.kind === "learning" || memory.kind === "vocabulary" ? "green"
                              : memory.kind === "short_term" ? "amber" : "neutral"}>{memory.kind}</Badge>
                          {memory.supersededBy && <Badge tone="amber">superseded</Badge>}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[10px] text-[var(--muted)]">
                        <span>{scopeLabel(memory.conversationId)} · {memory.source}</span>
                        <span>created {new Date(memory.createdAt).toLocaleString()} · {timeAgo(memory.createdAt)}</span>
                        <span>recalled {memory.recallCount}×{memory.lastRecalledAt ? ` · last ${timeAgo(memory.lastRecalledAt)}` : ""}</span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => { setEditingId(memory.id); setEditContent(memory.content); setEditKind(memory.kind); setEditGlobal(!memory.conversationId); }}
                          className="focus-ring rounded px-1 font-mono text-[10px] text-slate-400 hover:text-cyan-300"
                        >Edit</button>
                        <button
                          onClick={() => setDeleteId(memory.id)}
                          className="focus-ring rounded px-1 font-mono text-[10px] text-slate-400 hover:text-red-300"
                        >Delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete this memory?"
        description="This removes the stored fact from this browser. Current model weights are not changed."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteMemory(deleteId); setDeleteId(null); setNotice("Memory deleted."); }}
      />

      <div className="mt-10 border-t hairline pt-8">
        <BrainDashboard />
      </div>
    </>
  );
}
