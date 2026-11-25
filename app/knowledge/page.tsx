"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader, Card, Button, Input, Textarea, Field, Badge, EmptyState, ErrorBox, ConfirmDialog, timeAgo } from "@/components/ui";

export default function KnowledgePage() {
  const { knowledge, addKnowledge, updateKnowledge, deleteKnowledge, knowledgeToDataset, modelReady, training } = useStore();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const categories = useMemo(() => Array.from(new Set(knowledge.map((k) => k.category))).sort(), [knowledge]);
  const filtered = knowledge.filter((k) =>
    (categoryFilter === "all" || k.category === categoryFilter) &&
    (k.title.toLowerCase().includes(search.toLowerCase()) || k.content.toLowerCase().includes(search.toLowerCase()) || k.category.toLowerCase().includes(search.toLowerCase()))
  );
  const editing = knowledge.find((k) => k.id === editingId) ?? null;

  const loadEdit = (id: string) => {
    const k = knowledge.find((x) => x.id === id);
    if (!k) return;
    setEditingId(id); setTitle(k.title); setCategory(k.category); setContent(k.content); setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const resetForm = () => { setEditingId(null); setTitle(""); setCategory("General"); setContent(""); setError(null); };
  const submit = () => {
    setError(null);
    if (!title.trim()) { setError("A title is required."); return; }
    if (!content.trim()) { setError("Some content is required."); return; }
    if (editingId) updateKnowledge(editingId, { title, category: category.trim() || "General", content });
    else addKnowledge({ title, category: category.trim() || "General", content });
    resetForm();
  };

  return (
    <>
      <PageHeader eyebrow="Knowledge Management" title="Knowledge Base" description="Organize text for retrieval-augmented answers. Relevant entries are retrieved automatically when you chat with DavidAI; you can also send them to the local training corpus." />

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title={editing ? "Edit Entry" : "Add Knowledge"} subtitle={editing ? "Changes are saved locally" : "Store text for later use"}>
            <div className="space-y-3">
              <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short descriptive title" /></Field>
              <Field label="Category"><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="General" list="knowledge-categories" /><datalist id="knowledge-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
              <Field label="Content" hint={`${content.length.toLocaleString()} characters`}><Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={9} className="font-mono text-xs" placeholder="Paste knowledge text here..." /></Field>
              <ErrorBox message={error} />
              <div className="flex gap-2">
                <Button variant="primary" onClick={submit} className="flex-1">{editing ? "Save Changes" : "Add Entry"}</Button>
                {editing && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
              </div>
            </div>
          </Card>

          <Card title="Retrieved vs. Learned" subtitle="Two ways DavidAI uses your text">
            <div className="space-y-3 text-xs leading-relaxed text-[var(--muted)]">
              <p><span className="text-slate-300">Retrieved knowledge</span> is matched to each chat question and added to the local model's prompt before generation. No training is required. The local model is small, so retrieved text can guide it but cannot guarantee a correct or grounded answer.</p>
              <p><span className="text-slate-300">Learned knowledge</span> exists as numeric weights in the local training engine after you send an entry to a dataset and actually train.</p>
              <div className="rounded border hairline bg-black/20 p-3 font-mono text-[10px]">
                <div>LOCAL ENGINE: {modelReady ? "model loaded" : "no model"}</div>
                <div>TRAINING STEPS: {training.step}</div>
                <div>ENTRIES STORED: {knowledge.length}</div>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Entries" subtitle={`${filtered.length} shown of ${knowledge.length}`} action={<div className="flex gap-2"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries..." className="w-44 text-xs" /><select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="focus-ring rounded border hairline bg-black/25 px-2 text-xs"><option value="all">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>}>
          {filtered.length === 0 ? (
            <EmptyState title={knowledge.length ? "No matching entries" : "No knowledge entries"} description={knowledge.length ? "Try a different search or category." : "Add an entry to start organizing text for future training."} />
          ) : (
            <div className="space-y-2">
              {filtered.map((k) => (
                <div key={k.id} className="rounded border hairline bg-black/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><h3 className="truncate text-sm font-medium">{k.title}</h3><Badge>{k.category}</Badge></div>
                      <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">{k.content.length.toLocaleString()} chars · updated {timeAgo(k.updatedAt)}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => { try { knowledgeToDataset(k.id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Send to Dataset</Button>
                      <Button size="sm" variant="outline" onClick={() => loadEdit(k.id)}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget({ id: k.id, title: k.title })}>Delete</Button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-400">{k.content.slice(0, 400)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete knowledge entry?"
        description={`“${deleteTarget?.title ?? ""}” will be removed from local knowledge. This cannot be undone.`}
        confirmLabel="Delete entry"
        danger
        onConfirm={() => { if (deleteTarget) deleteKnowledge(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
