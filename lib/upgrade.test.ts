import { describe, expect, it } from "vitest";
import { parseDictionaryImport, SEED_WORDS } from "./dictionary";
import { buildExperimentalResult } from "./experimental";
import { memoryCategory } from "./types";
import type { DictionaryWord } from "./types";

function seedWords(): DictionaryWord[] {
  const stamp = "2020-01-01T00:00:00.000Z";
  return SEED_WORDS.map((seed, index) => ({
    id: `seed-${index}`, word: seed.word, definition: seed.definition,
    partOfSpeech: seed.partOfSpeech, example: seed.example,
    related: seed.related ?? [], synonyms: [], topics: ["everyday"],
    source: "bundled", reviewStatus: "approved", createdAt: stamp, updatedAt: stamp, useCount: 0,
  }));
}

describe("dictionary import", () => {
  it("parses bundled-format entries without duplicates", () => {
    const json = JSON.stringify({ entries: [
      { w: "ocean", p: "noun", d: "A large body of salt water.", s: ["sea"], r: ["water"], x: "The ocean is deep.", t: ["nature"] },
      { w: "Ocean", p: "noun", d: "Duplicate of ocean.", s: [], r: [], x: "", t: [] },
      { w: "rapidly", p: "adverb", d: "Very quickly.", s: [], r: [], x: "It grew rapidly.", t: ["descriptive"] },
    ] });
    const parsed = parseDictionaryImport(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].word).toBe("ocean");
    expect(parsed[0].synonyms).toEqual(["sea"]);
    expect(parsed[0].source).toBe("imported");
    expect(parsed[1].partOfSpeech).toBe("adverb");
  });

  it("accepts full DictionaryWord exports", () => {
    const json = JSON.stringify([{ word: "garden", definition: "A place for plants.", partOfSpeech: "noun", example: "I work in the garden." }]);
    const parsed = parseDictionaryImport(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].source).toBe("imported");
    expect(parsed[0].reviewStatus).toBe("approved");
  });
});

describe("experimental reasoning", () => {
  it("always separates known facts from hypotheses", () => {
    const result = buildExperimentalResult({
      message: "What is a world?", words: seedWords(),
      knowledge: [{ id: "k1", category: "Test", title: "World facts", content: "A world can mean a planet or a sphere.", createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" }],
      datasetFacts: [{ label: "Dataset · Test", text: "A world is a planet." }],
      memoryFacts: [], creativity: 70, risk: "high",
    });
    expect(result.knownFacts.length).toBeGreaterThan(0);
    expect(result.knownFacts.some((fact) => fact.includes("Knowledge · World facts"))).toBe(true);
    expect(result.hypotheses.length).toBeGreaterThan(0);
    expect(result.hypotheses.every((value) =>
      value.startsWith("Hypothesis") || value.startsWith("Possibility") || value.startsWith("Creative combination"))).toBe(true);
    expect(result.answer).toContain("Known:");
    expect(result.sources.some((source) => source.startsWith("Known ·"))).toBe(true);
  });

  it("does not invent a fact when local evidence is empty", () => {
    const result = buildExperimentalResult({
      message: "quantum banana", words: [], knowledge: [],
      datasetFacts: [], memoryFacts: [], creativity: 100, risk: "high",
    });
    expect(result.knownFacts).toEqual([]);
    expect(result.hypotheses[0]).toContain("Hypothesis (unverified)");
  });
});

describe("memory categories", () => {
  it("maps kinds to the five requested categories", () => {
    expect(memoryCategory("short_term")).toBe("short_term");
    expect(memoryCategory("explicit")).toBe("long_term");
    expect(memoryCategory("preference")).toBe("long_term");
    expect(memoryCategory("vocabulary")).toBe("vocabulary");
    expect(memoryCategory("correction")).toBe("learning");
    expect(memoryCategory("knowledge")).toBe("knowledge");
  });
});
