// Coerce loosely-shaped model JSON (snake_case keys, bare strings) into the structures the app expects.

export function pick(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return undefined;
}

export function normalizeConcept(c: any) {
  if (typeof c === "string") return { concept: c, definition: "" };
  return {
    concept: pick(c, "concept", "term", "name") ?? "",
    definition: pick(c, "definition", "meaning", "description") ?? "",
  };
}

export function normalizeQuestion(q: any) {
  if (typeof q === "string") return { question: q, type: "short-answer", answer: "" };
  const type = pick(q, "type");
  const allowed = ["multiple-choice", "short-answer", "true-false", "numeric"];
  return {
    question: pick(q, "question", "prompt", "text") ?? "",
    type: allowed.includes(type) ? type : "short-answer",
    options: pick(q, "options", "choices"),
    answer: String(pick(q, "answer", "correct_answer", "correctAnswer") ?? ""),
  };
}

export function toStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : pick(x, "question", "text", "takeaway") ?? JSON.stringify(x)));
}

export function normalizeChunk(raw: any) {
  const concepts = pick(raw, "keyConcepts", "key_concepts", "concepts");
  const questions = pick(raw, "practiceQuestions", "practice_questions", "questions");
  const guide = pick(raw, "readingGuide", "reading_guide") ?? {};
  return {
    summary: pick(raw, "summary", "overview") ?? "",
    keyConcepts: (Array.isArray(concepts) ? concepts : []).map(normalizeConcept),
    practiceQuestions: (Array.isArray(questions) ? questions : []).map(normalizeQuestion),
    readingGuide: {
      preReadingQuestions: toStringArray(pick(guide, "preReadingQuestions", "pre_reading_questions")),
      keyTakeaways: toStringArray(pick(guide, "keyTakeaways", "key_takeaways")),
    },
  };
}
