// Server-side AI orchestration.
// All provider API keys live here (loaded from environment) and never reach the browser.
import * as dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// Self-load env: ES-module imports execute before server.ts runs dotenv.config().
dotenv.config();

export type AIProvider = "gemini" | "openai" | "grok" | "anthropic" | "groq" | "openrouter";

interface AIConfig {
  provider: AIProvider;
  key: string;
  model: string;
}

class ProviderManager {
  private configs: AIConfig[] = [];
  private currentIdx = 0;

  constructor() {
    this.loadConfigs();
  }

  private loadConfigs() {
    const raw = process.env.AI_CONFIGS || process.env.VITE_AI_CONFIGS;
    if (raw) this.parseAndAddConfigs(raw);

    if (this.configs.length === 0 && process.env.GEMINI_API_KEY) {
      this.configs.push({
        provider: "gemini",
        key: process.env.GEMINI_API_KEY,
        model: "gemini-3-flash-preview",
      });
    }

    if (this.configs.length === 0) {
      console.warn("[ai] No AI providers configured. Set AI_CONFIGS in your .env file.");
    }
  }

  private parseAndAddConfigs(raw: string) {
    try {
      let cleaned = raw.trim();
      if ((cleaned.startsWith("'") && cleaned.endsWith("'")) ||
          (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
        cleaned = cleaned.slice(1, -1);
      }
      cleaned = cleaned.replace(/\}\s*\{/g, "}, {");
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) this.configs.push(...parsed);
      else if (parsed && typeof parsed === "object") this.configs.push(parsed as AIConfig);
    } catch (e) {
      console.error("[ai] Failed to parse AI_CONFIGS:", e);
    }
  }

  hasProviders() {
    return this.configs.length > 0;
  }

  primaryProvider(): AIProvider {
    return this.configs[0]?.provider ?? "gemini";
  }

  async runWithFailover<T>(fn: (config: AIConfig) => Promise<T>): Promise<T> {
    if (this.configs.length === 0) {
      throw Object.assign(new Error("No AI providers configured on the server."), { status: 503 });
    }
    let lastError: any;
    const startIdx = this.currentIdx;
    for (let i = 0; i < this.configs.length; i++) {
      const idx = (startIdx + i) % this.configs.length;
      const config = this.configs[idx];
      try {
        const result = await fn(config);
        this.currentIdx = idx;
        return result;
      } catch (error: any) {
        lastError = error;
        const msg = error?.message?.toLowerCase() || "";
        const status = error?.status || error?.code || error?.response?.status;
        const isTransient =
          status === 429 || status === 503 || status === 500 ||
          msg.includes("quota") || msg.includes("rate limit") || msg.includes("overloaded");
        if (isTransient && i < this.configs.length - 1) {
          console.warn(`[ai] Provider ${config.provider} failed, trying next...`);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }
}

const manager = new ProviderManager();

const gemini = (key: string) => new GoogleGenAI({ apiKey: key });
// Fail fast (60s) and let our own retry layer handle backoff, instead of the SDK
// silently retrying for minutes against a slow free endpoint.
const OAI_OPTS = { timeout: 90000, maxRetries: 0 } as const;
const openai = (key: string) => new OpenAI({ apiKey: key, ...OAI_OPTS });
const grok = (key: string) => new OpenAI({ apiKey: key, baseURL: "https://api.x.ai/v1", ...OAI_OPTS });
const groq = (key: string) => new OpenAI({ apiKey: key, baseURL: "https://api.groq.com/openai/v1", ...OAI_OPTS });
const openrouter = (key: string) => new OpenAI({
  apiKey: key,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Vellum" },
  ...OAI_OPTS,
});
const anthropic = (key: string) => new Anthropic({ apiKey: key });

// Returns an OpenAI-compatible client for the providers that share that API surface.
const openAiCompatible = (provider: AIProvider, key: string) =>
  provider === "openai" ? openai(key)
  : provider === "groq" ? groq(key)
  : provider === "openrouter" ? openrouter(key)
  : grok(key);

const MAX_CHAR_LIMIT = 500000;
const truncate = (text: string) =>
  text.length <= MAX_CHAR_LIMIT ? text : text.substring(0, MAX_CHAR_LIMIT) + "... [Truncated]";

const STUDY_SYSTEM =
  "You are a precise academic study assistant. You help readers improve speed and understanding.";

const QUESTION_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    question: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["multiple-choice", "short-answer", "true-false", "numeric"] },
    options: { type: Type.ARRAY, items: { type: Type.STRING } },
    answer: { type: Type.STRING },
  },
  required: ["question", "type", "answer"],
};

// --- Response normalization ---
// Free / OpenAI-compatible models often drift from the requested JSON shape
// (snake_case keys, bare strings instead of objects). Coerce to the shape the client expects.
function pick(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return undefined;
}

function normalizeConcept(c: any) {
  if (typeof c === "string") return { concept: c, definition: "" };
  return {
    concept: pick(c, "concept", "term", "name") ?? "",
    definition: pick(c, "definition", "meaning", "description") ?? "",
  };
}

function normalizeQuestion(q: any) {
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

function toStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : pick(x, "question", "text", "takeaway") ?? JSON.stringify(x)));
}

function normalizeChunk(raw: any) {
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

const asQuestionArray = (data: any) =>
  (Array.isArray(data) ? data : data?.questions || []).map(normalizeQuestion);

export const aiService = {
  info() {
    return { provider: manager.primaryProvider(), configured: manager.hasProviders() };
  },

  async ocr(fileData: string): Promise<string> {
    const prompt = `
      Please extract all text from this scanned document accurately.
      CRITICAL:
      - Maintain the original structure, including paragraph breaks.
      - Use double newlines between paragraphs to ensure readability.
      - If there are headings, keep them on their own lines.
      - Do not add any commentary, just the extracted text.
    `;
    return manager.runWithFailover(async (config) => {
      if (config.provider !== "gemini") {
        throw new Error(`${config.provider} does not support direct PDF OCR. Please configure Gemini for scanned documents.`);
      }
      const ai = gemini(config.key);
      const response = await ai.models.generateContent({
        model: config.model,
        contents: [{ parts: [{ text: prompt }, { inlineData: { data: fileData, mimeType: "application/pdf" } }] }],
      });
      return response.text ?? "";
    });
  },

  async analyzeChunk(chunk: string, index: number, total: number): Promise<any> {
    const prompt = `
      Analyze the following section (${index + 1}/${total}) of a study document.

      Tasks:
      1. Summary: A concise overview.
      2. Key Concepts: Important terms and definitions.
      3. Practice Questions: 2 high-quality questions.
      4. Reading Guide:
         - 2 Pre-reading questions: What specific details should the reader look for in this section?
         - 3 Key takeaways: What are the most critical insights?

      CRITICAL:
      - Return ONLY a JSON object with EXACTLY these camelCase keys and structure:
        {
          "summary": "string",
          "keyConcepts": [{ "concept": "string", "definition": "string" }],
          "practiceQuestions": [{ "question": "string", "type": "short-answer", "options": ["string"], "answer": "string" }],
          "readingGuide": { "preReadingQuestions": ["string"], "keyTakeaways": ["string"] }
        }
      - "type" must be one of: "multiple-choice", "short-answer", "true-false", "numeric".
      - Ensure all arrays are populated with relevant content.
      - DO NOT use double asterisks.
    `;
    const userContent = `${prompt}\n\nDOCUMENT CONTENT SECTION:\n${chunk}`;

    return manager.runWithFailover(async (config) => {
      if (config.provider === "gemini") {
        const ai = gemini(config.key);
        const response = await ai.models.generateContent({
          model: config.model,
          contents: [{ parts: [{ text: userContent }] }],
          config: {
            systemInstruction: STUDY_SYSTEM,
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                keyConcepts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { concept: { type: Type.STRING }, definition: { type: Type.STRING } },
                    required: ["concept", "definition"],
                  },
                },
                practiceQuestions: { type: Type.ARRAY, items: QUESTION_ITEM_SCHEMA },
                readingGuide: {
                  type: Type.OBJECT,
                  properties: {
                    preReadingQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ["preReadingQuestions", "keyTakeaways"],
                },
              },
              required: ["summary", "keyConcepts", "practiceQuestions", "readingGuide"],
            },
          },
        });
        return normalizeChunk(JSON.parse(response.text ?? "{}"));
      } else if (config.provider === "anthropic") {
        const client = anthropic(config.key);
        const response = await client.messages.create({
          model: config.model,
          max_tokens: 4096,
          system: `${STUDY_SYSTEM} Always respond in valid JSON format.`,
          messages: [{ role: "user", content: userContent }],
        });
        const content = response.content[0].type === "text" ? response.content[0].text : "{}";
        return normalizeChunk(JSON.parse(content));
      } else {
        const client = openAiCompatible(config.provider, config.key);
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: `${STUDY_SYSTEM} Always respond in valid JSON format.` },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        });
        return normalizeChunk(JSON.parse(response.choices[0].message.content || "{}"));
      }
    });
  },

  async synthesize(summaries: string): Promise<string> {
    const prompt = `
      Based on the following section summaries of a document, write a single, cohesive, and comprehensive paragraph that summarizes the entire document.
      CRITICAL:
      - The response MUST be exactly ONE paragraph.
      - Do not use bullet points or multiple paragraphs.
      - Capture the core message and most important findings.
      - Do not use double asterisks (**).
    `;
    const userContent = `${prompt}\n\nSECTION SUMMARIES:\n${summaries}`;

    return manager.runWithFailover(async (config) => {
      if (config.provider === "gemini") {
        const ai = gemini(config.key);
        const response = await ai.models.generateContent({
          model: config.model,
          contents: [{ parts: [{ text: userContent }] }],
          config: { temperature: 0.3 },
        });
        return (response.text ?? "").trim();
      } else if (config.provider === "anthropic") {
        const client = anthropic(config.key);
        const response = await client.messages.create({
          model: config.model,
          max_tokens: 1024,
          system: "You are a precise academic study assistant. Always respond with a single paragraph.",
          messages: [{ role: "user", content: userContent }],
        });
        return (response.content[0].type === "text" ? response.content[0].text : "").trim();
      } else {
        const client = openAiCompatible(config.provider, config.key);
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: "You are a precise academic study assistant. Always respond with a single paragraph." },
            { role: "user", content: userContent },
          ],
        });
        return response.choices[0].message.content?.trim() || summaries;
      }
    });
  },

  async moreQuestions(text: string, existingQuestions: string[]): Promise<any[]> {
    const prompt = `
      Based on the following study document text, generate 5 NEW practice questions.
      DO NOT repeat any of the existing questions provided below.

      Existing Questions (to avoid):
      ${existingQuestions.join("\n")}

      Return the result in JSON format as an array of objects.
    `;
    return this.runQuestionPrompt(prompt, truncate(text));
  },

  async topicQuestions(text: string, topic: string): Promise<any[]> {
    const prompt = `
      Based on the following document text, generate 5 practice questions SPECIFICALLY about the topic: "${topic}".
      Return the result in JSON format as an array of objects.
    `;
    return this.runQuestionPrompt(prompt, truncate(text));
  },

  async runQuestionPrompt(prompt: string, truncatedText: string): Promise<any[]> {
    return manager.runWithFailover(async (config) => {
      if (config.provider === "gemini") {
        const ai = gemini(config.key);
        const response = await ai.models.generateContent({
          model: config.model,
          contents: [{ parts: [{ text: prompt }, { text: truncatedText }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: { type: Type.ARRAY, items: QUESTION_ITEM_SCHEMA },
          },
        });
        return asQuestionArray(JSON.parse(response.text ?? "[]"));
      } else if (config.provider === "anthropic") {
        const client = anthropic(config.key);
        const response = await client.messages.create({
          model: config.model,
          max_tokens: 2048,
          system: "You are a precise academic study assistant. Always respond in valid JSON format.",
          messages: [{ role: "user", content: `${prompt}\n\nDOCUMENT CONTENT:\n${truncatedText}` }],
        });
        const content = response.content[0].type === "text" ? response.content[0].text : "{}";
        return asQuestionArray(JSON.parse(content));
      } else {
        const client = openAiCompatible(config.provider, config.key);
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: "You are a precise academic study assistant. Always respond in valid JSON format." },
            { role: "user", content: `${prompt}\n\nDOCUMENT CONTENT:\n${truncatedText}` },
          ],
          response_format: { type: "json_object" },
        });
        return asQuestionArray(JSON.parse(response.choices[0].message.content || "{}"));
      }
    });
  },

  async ask(documentText: string, userQuestion: string): Promise<string> {
    const prompt = `
      Based on the following document text, answer the user's question.
      If the answer is not in the text, say you don't know based on the provided context.

      Formatting Instructions:
      - Use Markdown for formatting.
      - Use clear headers (e.g., ### Header) for different sections.
      - Use bullet points for lists.
      - Ensure the response is structured and easy to read.
      - Use bold text for emphasis where appropriate.
      - Avoid long blocks of text; break information into digestible chunks.
      - Answer the user's question directly and clearly.

      Document Text:
      ${truncate(documentText)}

      User Question:
      ${userQuestion}
    `;
    const fallback = "I'm sorry, I couldn't generate an answer.";

    return manager.runWithFailover(async (config) => {
      if (config.provider === "gemini") {
        const ai = gemini(config.key);
        const response = await ai.models.generateContent({ model: config.model, contents: prompt });
        return response.text ?? fallback;
      } else if (config.provider === "anthropic") {
        const client = anthropic(config.key);
        const response = await client.messages.create({
          model: config.model,
          max_tokens: 4096,
          system: "You are a precise academic study assistant.",
          messages: [{ role: "user", content: prompt }],
        });
        return response.content[0].type === "text" ? response.content[0].text : fallback;
      } else {
        const client = openAiCompatible(config.provider, config.key);
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: "You are a precise academic study assistant." },
            { role: "user", content: prompt },
          ],
        });
        return response.choices[0].message.content || fallback;
      }
    });
  },
};
