import type { Correction, Dataset, DictionaryWord, KnowledgeEntry, Memory } from "./types";
import { conversationPairs, datasetAnswers } from "./learning";
import { Tokenizer } from "@/engine/tokenizer";
import { validateConfig, type ModelConfig } from "@/engine/transformer";

export interface WordCorpusInput {
  datasets: Dataset[];
  knowledge: KnowledgeEntry[];
  dictionary: DictionaryWord[];
  memories: Memory[];
  corrections: Correction[];
  /** Optional vocabulary cap. Smaller vocabularies give each word more training signal. */
  maxVocab?: number;
}

export interface WordCorpus {
  texts: string[];
  /** Parallel source label for each text, used for category statistics and staged training. */
  sources: string[];
  tokenizer: Tokenizer;
  config: ModelConfig;
  examples: number;
  words: number;
}

// A tiny from-scratch model cannot learn 12k words from ~200k tokens: most
// words would appear only once or twice. Measured on this corpus, a 2k
// vocabulary cut validation loss from 5.78 (8k vocab) to 4.33 with a third of
// the parameters, so it is the new browser-retraining default.
const MAX_WORDS = 2000;
const MAX_DICTIONARY = 6000;

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Training examples use the exact prompt shape used at answer time, including
 * the Context: line when evidence is present. This removes the train/inference
 * mismatch that otherwise teaches the model to ignore retrieved evidence.
 */
function pair(question: string, answer: string, evidence: string[] = []): string {
  const q = tidy(question);
  const a = tidy(answer);
  if (!q || !a) return "";
  return `${wordPrompt(q, evidence)}\n${a}`;
}

/**
 * Build a real training corpus for the word-level language model.
 *
 * Every line here is training DATA, not a runtime response rule. The model
 * learns word relationships and sentence patterns from these examples and
 * generates its own continuations at answer time. Dictionary entries become
 * question/answer training examples, which is how the model learns definitions
 * without the chat pipeline hardcoding them.
 */
export function buildWordCorpus(input: WordCorpusInput): WordCorpus {
  const texts: string[] = [];
  const sources: string[] = [];
  const push = (text: string | null | undefined, source: string): void => {
    if (text) { texts.push(text); sources.push(source); }
  };

  for (const dataset of input.datasets) {
    if (dataset.content?.trim()) push(dataset.content.trim(), "datasets");
  }
  for (const entry of input.knowledge) {
    push(pair(`Tell me about ${entry.title}`, entry.content, [entry.content]), "knowledge");
  }
  for (const word of input.dictionary.filter((entry) => entry.reviewStatus !== "rejected").slice(0, MAX_DICTIONARY)) {
    const definition = tidy(word.definition).replace(/\.$/, "");
    if (!definition) continue;
    const example = tidy(word.example);
    const answer = `${word.word} is ${definition.charAt(0).toLowerCase()}${definition.slice(1)}.${example ? ` For example, ${example.charAt(0).toLowerCase()}${example.slice(1)}` : ""}`;
    push(pair(`What does ${word.word} mean`, answer, [`${word.word}: ${definition}`]), "dictionary");
  }
  for (const correction of input.corrections) {
    if (correction.status !== "approved") continue;
    push(pair(correction.question, correction.correctedAnswer, [correction.correctedAnswer]), "corrections");
  }
  for (const memory of input.memories) {
    if (memory.supersededBy) continue;
    if (memory.kind !== "vocabulary" && memory.kind !== "knowledge" && memory.kind !== "fact" && memory.kind !== "preference") continue;
    push(`Remember: ${tidy(memory.content)}.`, "memories");
  }
  for (const dataset of input.datasets) {
    for (const qa of conversationPairs([dataset.content])) {
      push(pair(qa.question, qa.answer, [qa.answer]), "conversation");
    }
    for (const qa of datasetAnswers([{ title: dataset.name, content: dataset.content }])) {
      push(pair(qa.question, qa.answer, [qa.answer]), "instruction");
    }
  }

  // Deduplicate while keeping source labels aligned.
  const seen = new Set<string>();
  const unique: string[] = [];
  const uniqueSources: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (!texts[i] || seen.has(texts[i])) continue;
    seen.add(texts[i]);
    unique.push(texts[i]);
    uniqueSources.push(sources[i]);
  }
  const tokenizer = Tokenizer.buildWords(unique, Math.max(512, Math.floor(input.maxVocab ?? MAX_WORDS)));
  const base: ModelConfig = {
    layers: 2,
    heads: 2,
    dModel: 64,
    blockSize: 64,
    dFF: 256,
    vocabSize: tokenizer.size,
  };
  const config = validateConfig(base) === null ? base : {
    layers: 1, heads: 2, dModel: 32, blockSize: 48, dFF: 128, vocabSize: tokenizer.size,
  };
  return { texts: unique, sources: uniqueSources, tokenizer, config, examples: unique.length, words: tokenizer.size };
}

/** Conditioning prompt shared by training and generation. */
export function wordPrompt(question: string, evidence: string[] = []): string {
  const lines: string[] = [];
  const useful = evidence.map((value) => tidy(value)).filter((value) => value.length > 0).slice(0, 4);
  if (useful.length) lines.push(`Context: ${useful.join(" | ")}`);
  lines.push(`User: ${tidy(question)}`);
  lines.push("DavidAI:");
  return lines.join("\n");
}
