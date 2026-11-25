import type { ModelConfig } from "@/engine/transformer";
import type { ReasoningSummary } from "./trace";
import type { LanguageUnderstanding } from "./language";
import type { AnswerVerification, ReasoningPlan } from "./reasoning";

export interface Dataset {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckpointMeta {
  id: string;
  name: string;
  createdAt: string;
  config: ModelConfig;
  vocabSize: number;
  trainingSteps: number;
  loss: number | null;
  sizeBytes: number;
  datasetNames: string[];
  /** Which live model this snapshot belongs to; older checkpoints are char by default. */
  mode?: "char" | "word";
}

export interface CheckpointRecord {
  meta: CheckpointMeta;
  snapshot: unknown;
}

export interface ExperimentResult {
  step: number;
  loss: number;
  timestamp: string;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  config: ModelConfig;
  datasetIds: string[];
  createdAt: string;
  results: ExperimentResult[];
}

export interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  /** Present when this entry came from a real retrieved webpage. */
  sourceUrl?: string;
  sourceTitle?: string;
  retrievedAt?: string;
}

export type DictionaryCategory =
  | "noun" | "verb" | "adjective" | "adverb" | "pronoun"
  | "article" | "preposition" | "conjunction" | "other";

export type ReviewState = "pending" | "approved" | "rejected";

export interface DictionaryWord {
  id: string;
  word: string;
  definition: string;
  partOfSpeech: DictionaryCategory;
  example: string;
  related: string[];
  synonyms?: string[];
  /** Topic labels such as technology, science, nature, emotions. */
  topics?: string[];
  /** bundled = local WordNet dataset, feedback = user correction, imported = user file. */
  source?: string;
  reviewStatus?: ReviewState;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
}

export interface ExperimentProposal {
  type: "dictionary" | "knowledge";
  word?: string;
  definition?: string;
  partOfSpeech?: DictionaryCategory;
  example?: string;
  title?: string;
  category?: string;
  content?: string;
}

export interface SandboxExperiment {
  id: string;
  name: string;
  risk: "low" | "medium" | "high";
  strategy: string;
  prompt: string;
  simulatedAnswer: string;
  alternatives: string[];
  sources: string[];
  analysis: string;
  mode?: "grounded" | "experimental";
  creativity?: number;
  knownFacts?: string[];
  hypotheses?: string[];
  proposal?: ExperimentProposal;
  status: "draft" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export type MemoryKind =
  | "fact" | "preference" | "explicit" | "correction"
  | "short_term" | "vocabulary" | "learning" | "knowledge";
export type MemoryCategory = "short_term" | "long_term" | "vocabulary" | "learning" | "knowledge";

export function memoryCategory(kind: MemoryKind): MemoryCategory {
  if (kind === "short_term") return "short_term";
  if (kind === "vocabulary") return "vocabulary";
  if (kind === "learning" || kind === "correction") return "learning";
  if (kind === "knowledge") return "knowledge";
  return "long_term";
}

export interface Memory {
  id: string;
  content: string;
  kind: MemoryKind;
  /** null means it applies to the whole user workspace; otherwise one conversation. */
  conversationId: string | null;
  source: "user" | "correction" | "manual";
  sourceMessageId?: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
  lastRecalledAt?: string;
  recallCount: number;
  supersededBy?: string;
  supersedes?: string[];
}

export type FeedbackRating =
  | "helpful" | "not_helpful" | "incorrect" | "incomplete"
  | "gibberish" | "too_complicated" | "not_relevant";
export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Feedback {
  id: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  userMessage: string;
  assistantResponse: string;
  rating: FeedbackRating;
  explanation: string;
  correction: string;
  /** Derived from the rating: the concrete problem DavidAI should avoid. */
  issue?: string;
  /** Derived suggestion for the next response. */
  improvement?: string;
  status: ReviewStatus;
  createdAt: string;
  reviewedAt?: string;
  correctionId?: string;
  trainingExampleIds: string[];
}

export interface Correction {
  id: string;
  feedbackId: string;
  conversationId: string;
  question: string;
  originalAnswer: string;
  correctedAnswer: string;
  explanation: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
  exampleId?: string;
  memoryId?: string;
  /** Dictionary entry created or updated from this correction, when applicable. */
  dictionaryId?: string;
}

export interface TrainingExample {
  id: string;
  kind: "correction" | "memory";
  sourceId: string;
  question: string;
  answer: string;
  prompt: string;
  text: string;
  hash: string;
  createdAt: string;
  usedInSessionIds: string[];
}

export interface LearningSession {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "complete" | "error";
  steps: number;
  exampleIds: string[];
  trainExampleIds: string[];
  validationExampleIds: string[];
  lossHistory: { step: number; loss: number }[];
  validationHistory: { step: number; loss: number }[];
  finalLoss: number | null;
  finalValidationLoss: number | null;
  checkpointId?: string;
  backupCheckpointId?: string;
  modelVersion?: number;
  error?: string;
}

export interface ModelVersion {
  id: string;
  version: number;
  createdAt: string;
  sessionId: string;
  checkpointId: string;
  source: "manual" | "feedback";
  step: number;
  loss: number | null;
  validationLoss: number | null;
  vocabSize: number;
  config: ModelConfig;
  exampleIds: string[];
}

export interface Activity {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: string;
}

/** Immutable audit record for a change to existing learned information. */
export interface LearningEdit {
  id: string;
  targetType: "training_example" | "dictionary" | "knowledge" | "memory" | "correction" | "feedback";
  targetId: string;
  field: string;
  before: string;
  after: string;
  reason: string;
  createdAt: string;
}

export interface TrainingLog {
  id: string;
  timestamp: string;
  level: Activity["type"];
  message: string;
  step?: number;
}

/**
 * Quick modes are real processing strategies, not labels. Each one selects a
 * different combination of retrieval breadth, strictness, web use, sampling
 * and system-prompt style. "Auto" derives the strategy from the question.
 */
export type AssistantMode = "auto" | "thinking" | "research" | "creative" | "coding" | "learning" | "sandbox";

export const ASSISTANT_MODES: AssistantMode[] = [
  "auto", "thinking", "research", "creative", "coding", "learning", "sandbox",
];

export interface ChatAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "document" | "image";
  /** Documents are indexed into the local SQLite brain for real retrieval. */
  status: "indexed" | "pending" | "error";
  chunkCount?: number;
  error?: string;
}

export interface AppSettings {
  theme: "dark" | "midnight" | "light";
  density: "comfortable" | "compact";
  learningRate: number;
  /** Learning-rate schedule: cosine decays after a short warmup; constant keeps a fixed rate. */
  lrSchedule: "constant" | "cosine";
  /** Residual dropout probability used when training new models; 0 disables it. */
  dropout: number;
  /** AdamW decoupled weight decay applied during training. */
  weightDecay: number;
  batchSize: number;
  trainingSteps: number;
  temperature: number;
  maxTokens: number;
  topK: number;
  /** Nucleus sampling threshold; 1 disables nucleus filtering. */
  topP: number;
  /** Penalty applied to already-generated tokens; 1 disables it. */
  repetitionPenalty: number;
  autoSave: boolean;
  gradientClip: number;
  useKnowledge: boolean;
  useMemory: boolean;
  useCorrections: boolean;
  /** Rank retrieved answers with the local model instead of sampling raw tokens. */
  useGroundedAnswers: boolean;
  /** Normal mode is grounded; experimental mode allows clearly labelled hypotheses. */
  chatMode: "grounded" | "experimental";
  sandboxExperimental: boolean;
  sandboxCreativity: number;
  /** Experimental intensity: how far the sandbox may deviate from local evidence. */
  sandboxIntensity: number;
  sandboxRisk: "low" | "medium" | "high";
  /** generative = word-level language model writes the reply; retrieval = quote local evidence. */
  answerEngine: "generative" | "retrieval";
  /** When on, the chat may query free public web services. Default off for privacy. */
  webSearch: boolean;
  /** When on, the chat shows each real research operation live. */
  researchMode: boolean;
  feedbackTrainingSteps: number;
  /** Use the installed Qwen GGUF through llama.cpp for grounded answers. */
  useLocalLlm: boolean;
  /** Mirror every conversation into the permanent local SQLite brain. */
  brainAutoSave: boolean;
  /** Add MiniLM embedding similarity to lexical/FTS retrieval when available. */
  useSemanticRetrieval: boolean;
  /** With no relevant local memory, answer honestly instead of guessing from model priors. */
  strictOfflineMemory: boolean;
  /** Quick mode that changes retrieval, web use, sampling and prompting. */
  assistantMode: AssistantMode;
}

export interface TrainingState {
  status: "idle" | "initializing" | "running" | "paused" | "stopped" | "complete" | "error";
  step: number;
  totalSteps: number;
  loss: number | null;
  lossHistory: { step: number; loss: number }[];
  validationHistory: { step: number; loss: number }[];
  validationLoss: number | null;
  tokensSeen: number;
  elapsedMs: number;
  error: string | null;
  experimentId: string | null;
  logs: TrainingLog[];
  samples: number;
  epoch: number;
  batchSize: number;
  learningRate: number;
  gradNorm: number | null;
  stepsPerSecond: number | null;
  etaMs: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokensGenerated?: number;
  elapsedMs?: number;
  tokensPerSecond?: number;
  sources?: string[];
  provider?: string;
  model?: string;
  memoryIds?: string[];
  correctionIds?: string[];
  feedbackId?: string;
  modelVersion?: number;
  localModel?: boolean;
  answerMode?: "grounded" | "generated" | "fallback" | "experimental";
  engine?: "generative" | "retrieval" | "local-llm";
  reasoning?: ReasoningSummary;
  understanding?: LanguageUnderstanding;
  reasoningPlan?: ReasoningPlan;
  verification?: AnswerVerification;
  traceId?: string;
  /** Present when this answer was assembled from real web research. */
  webResearch?: import("./research/types").WebResearchResult;
  /** Files the user attached to this turn and that were indexed locally. */
  attachments?: ChatAttachment[];
  /** Strategy that produced this answer. */
  mode?: AssistantMode;
  /** Set when the user edited a previous message before resending. */
  edited?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  /** Pinned conversations sort first and stay visible in the filtered list. */
  pinned?: boolean;
  /** Optional user-defined grouping key. */
  folderId?: string | null;
  archived?: boolean;
}

export interface DatasetStats {
  chars: number;
  tokens: number;
  windows: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  density: "comfortable",
  learningRate: 0.001,
  lrSchedule: "cosine",
  dropout: 0,
  weightDecay: 0.01,
  batchSize: 4,
  trainingSteps: 500,
  temperature: 0.8,
  maxTokens: 120,
  topK: 0,
  topP: 0.9,
  repetitionPenalty: 1.1,
  autoSave: true,
  gradientClip: 1,
  useKnowledge: true,
  useMemory: true,
  useCorrections: true,
  useGroundedAnswers: true,
  chatMode: "grounded",
  sandboxExperimental: true,
  sandboxCreativity: 35,
  sandboxIntensity: 40,
  sandboxRisk: "low",
  answerEngine: "generative",
  webSearch: false,
  researchMode: false,
  feedbackTrainingSteps: 240,
  useLocalLlm: true,
  brainAutoSave: true,
  useSemanticRetrieval: true,
  strictOfflineMemory: true,
  assistantMode: "auto",
};

export const DEFAULT_TRAINING_STATE: TrainingState = {
  status: "idle",
  step: 0,
  totalSteps: 0,
  loss: null,
  lossHistory: [],
  validationHistory: [],
  validationLoss: null,
  tokensSeen: 0,
  elapsedMs: 0,
  error: null,
  experimentId: null,
  logs: [],
  samples: 0,
  epoch: 0,
  batchSize: 0,
  learningRate: 0,
  gradNorm: null,
  stepsPerSecond: null,
  etaMs: null,
};
