import { KeyConcept, PracticeQuestion, ReadingGuide } from "../types";

// Thin client for the server-side AI API. Provider API keys live only on the server
// (see aiService.ts) and are never shipped to the browser.

const CHUNK_SIZE = 12000; // larger chunks = fewer (slow) AI calls per document
const MAX_CHUNKS = 300;
const MAX_CONCURRENT_CHUNKS = 3; // free-tier-friendly: cap parallel AI calls to avoid rate limits

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const splitIntoChunks = (text: string, size: number): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.substring(i, i + size));
  }
  return chunks;
};

// POST JSON with a per-request timeout + retry/backoff on transient (rate-limit /
// overload / timeout) errors, so one slow free-tier call can't stall forever.
async function postJson<T>(url: string, body: unknown, retries = 4, timeoutMs = 120000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const backoff = () => sleep(Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 500);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(timer);
      // Aborted (timeout) or network error — treat as transient.
      if (attempt < retries) {
        await backoff();
        continue;
      }
      throw new Error(e?.name === "AbortError" ? `Request to ${url} timed out` : e?.message || "Network error");
    }
    clearTimeout(timer);

    if (response.ok) return (await response.json()) as T;

    let message = `Request to ${url} failed (${response.status})`;
    try {
      const err = await response.json();
      if (err?.error) message = err.error;
    } catch {
      /* response had no JSON body */
    }

    const transient =
      response.status === 429 ||
      response.status === 503 ||
      response.status === 500 ||
      /\b429\b|rate limit|overloaded|quota/i.test(message);

    if (transient && attempt < retries) {
      await backoff();
      continue;
    }
    throw new Error(message);
  }
}

// Runs `worker` over items with a bounded number of concurrent calls, preserving order.
async function mapWithConcurrency<TIn, TOut>(
  items: TIn[],
  limit: number,
  worker: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
  const results = new Array<TOut>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

interface ChunkAnalysis {
  summary: string;
  keyConcepts: KeyConcept[];
  practiceQuestions: PracticeQuestion[];
  readingGuide: Pick<ReadingGuide, "preReadingQuestions" | "keyTakeaways">;
}

export const StudyService = {
  async extractTextFromFile(
    file: File
  ): Promise<{ text: string; title: string; isPossiblyScanned?: boolean; fileData?: string }> {
    const formData = new FormData();
    formData.append("pdf", file); // Multer expects the field name "pdf"

    const response = await fetch("/api/extract-pdf", { method: "POST", body: formData });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to extract text from file: ${response.status} ${errorText.substring(0, 100)}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Server returned an unexpected response format. Please ensure the server is running correctly.");
    }

    const data = await response.json();

    let fileData: string | undefined;
    if (file.type === "application/pdf") {
      fileData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
    }

    if (!data.text.trim() && file.type === "application/pdf") {
      return { text: "", title: data.title || file.name, isPossiblyScanned: true, fileData };
    }

    return { text: data.text, title: data.title || file.name, fileData };
  },

  async extractTextFromScannedFile(fileData: string): Promise<string> {
    return postJson<string>("/api/ai/ocr", { fileData });
  },

  async generateStudyMaterials(
    text: string,
    fileData?: string,
    onProgress?: (progress: { current: number; total: number }) => void,
    chunkSize: number = CHUNK_SIZE
  ): Promise<{
    summary: string;
    keyConcepts: KeyConcept[];
    practiceQuestions: PracticeQuestion[];
    readingGuide: ReadingGuide;
    chunkGuides?: ReadingGuide[];
  }> {
    if (!text && !fileData) {
      throw new Error("No content available to analyze.");
    }

    let contentToAnalyze = text;
    if (!text.trim() && fileData) {
      if (onProgress) onProgress({ current: 0, total: 1 }); // OCR started
      contentToAnalyze = await this.extractTextFromScannedFile(fileData);
    }

    if (!contentToAnalyze || contentToAnalyze.trim().length < 50) {
      throw new Error("The document contains too little text to analyze.");
    }

    // Chunking and progress stay client-side; each chunk's AI work runs on the server.
    const chunks = splitIntoChunks(contentToAnalyze, chunkSize).slice(0, MAX_CHUNKS);
    let completed = 0;
    if (onProgress) onProgress({ current: 0, total: chunks.length });

    const emptyAnalysis: ChunkAnalysis = {
      summary: "",
      keyConcepts: [],
      practiceQuestions: [],
      readingGuide: { preReadingQuestions: [], keyTakeaways: [] },
    };

    const results = await mapWithConcurrency(chunks, MAX_CONCURRENT_CHUNKS, async (chunk, index) => {
      let result: ChunkAnalysis;
      try {
        result = await postJson<ChunkAnalysis>("/api/ai/analyze-chunk", {
          chunk,
          index,
          total: chunks.length,
        });
      } catch (error) {
        // One rate-limited chunk shouldn't fail the whole document.
        console.warn(`Chunk ${index + 1}/${chunks.length} failed, skipping:`, error);
        result = emptyAnalysis;
      }
      completed++;
      if (onProgress) onProgress({ current: completed, total: chunks.length });
      return result;
    });

    const combinedSummaryText = results.map((r) => r.summary).join("\n\n");
    let finalSummary = combinedSummaryText;
    try {
      finalSummary = await postJson<string>("/api/ai/synthesize", { summaries: combinedSummaryText });
    } catch (error) {
      console.error("Failed to generate final summary synthesis:", error);
      // Fall back to the concatenated section summaries.
    }

    const combinedConcepts = Array.from(
      new Map(results.flatMap((r) => r.keyConcepts).map((c) => [c.concept, c])).values()
    );
    const combinedQuestions = results.flatMap((r) => r.practiceQuestions).slice(0, 10);

    const combinedGuide: ReadingGuide = {
      preReadingQuestions: results.flatMap((r) => r.readingGuide.preReadingQuestions).slice(0, 5),
      keyTakeaways: results.flatMap((r) => r.readingGuide.keyTakeaways).slice(0, 8),
      reflectivePrompt: "",
      speedHighlights: [],
    };

    return {
      summary: finalSummary,
      keyConcepts: combinedConcepts,
      practiceQuestions: combinedQuestions,
      readingGuide: combinedGuide,
      chunkGuides: results.map((r) => ({
        ...r.readingGuide,
        reflectivePrompt: "",
        speedHighlights: [],
      })),
    };
  },

  async generateMoreQuestions(
    text: string,
    existingQuestions: PracticeQuestion[]
  ): Promise<PracticeQuestion[]> {
    return postJson<PracticeQuestion[]>("/api/ai/more-questions", {
      text,
      existingQuestions: existingQuestions.map((q) => q.question),
    });
  },

  async generateTopicQuestions(text: string, topic: string): Promise<PracticeQuestion[]> {
    return postJson<PracticeQuestion[]>("/api/ai/topic-questions", { text, topic });
  },

  async askQuestion(documentText: string, userQuestion: string): Promise<string> {
    return postJson<string>("/api/ai/ask", { documentText, userQuestion });
  },
};
