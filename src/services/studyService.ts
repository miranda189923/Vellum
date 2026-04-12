import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { StudyDocument, KeyConcept, PracticeQuestion, ReadingGuide } from "../types";

export type AIProvider = "gemini" | "openai" | "grok" | "anthropic" | "groq";

interface AIConfig {
  provider: AIProvider;
  key: string;
  model: string;
}

class ProviderManager {
  private configs: AIConfig[] = [];
  private currentIdx = 0;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.loadConfigs();
  }

  private async loadConfigs() {
    const jsonConfigs = import.meta.env.VITE_AI_CONFIGS || import.meta.env.AI_CONFIGS;
    if (jsonConfigs) {
      this.parseAndAddConfigs(jsonConfigs, "env");
    }

    if (this.configs.length === 0) {
      try {
        const response = await fetch("/api/ai-config");
        if (response.ok) {
          const data = await response.json();
          if (data.AI_CONFIGS) {
            this.parseAndAddConfigs(data.AI_CONFIGS, "server");
          }
          
          if (this.configs.length === 0 && data.GEMINI_API_KEY) {
            this.configs.push({
              provider: "gemini",
              key: data.GEMINI_API_KEY,
              model: "gemini-3-flash-preview"
            });
          }
        }
      } catch (e) {
        console.warn("AI config fetch failed, using local fallbacks:", e);
      }
    }

    if (this.configs.length === 0) {
      console.warn("No AI providers configured.");
    }
  }

  private parseAndAddConfigs(raw: string, source: string) {
    try {
      let cleaned = raw.trim();
      if ((cleaned.startsWith("'") && cleaned.endsWith("'")) || (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
        cleaned = cleaned.slice(1, -1);
      }
      
      cleaned = cleaned.replace(/\}\s*\{/g, "}, {");
      
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        this.configs = [...this.configs, ...parsed];
      } else if (typeof parsed === "object") {
        this.configs.push(parsed as AIConfig);
      }
    } catch (e) {
      console.error(`Failed to parse AI_CONFIGS from ${source}:`, e);
    }
  }

  async ensureInitialized() {
    if (this.initPromise) await this.initPromise;
  }

  getConfigs() {
    return this.configs;
  }

  async runWithFailover<T>(fn: (config: AIConfig) => Promise<T>): Promise<T> {
    await this.ensureInitialized();
    
    if (this.configs.length === 0) {
      throw new Error("No AI providers configured. Please check your .env file.");
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
        const errorMsg = error?.message?.toLowerCase() || "";
        const status = error?.status || error?.code || (error?.response?.status);
        
        const isTransient = 
          status === 429 || 
          status === 503 || 
          status === 500 ||
          errorMsg.includes("quota") || 
          errorMsg.includes("rate limit") || 
          errorMsg.includes("overloaded");
        
        if (isTransient && i < this.configs.length - 1) {
          console.warn(`Provider ${config.provider} failed, trying next...`);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }
}

const providerManager = new ProviderManager();

const getGeminiAI = (key: string) => new GoogleGenAI({ apiKey: key });
const getOpenAI = (key: string) => new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
const getGrokAI = (key: string) => new OpenAI({ 
  apiKey: key, 
  baseURL: "https://api.x.ai/v1", 
  dangerouslyAllowBrowser: true 
});
const getGroqAI = (key: string) => new OpenAI({ 
  apiKey: key, 
  baseURL: "https://api.groq.com/openai/v1", 
  dangerouslyAllowBrowser: true 
});
const getAnthropicAI = (key: string) => new Anthropic({ apiKey: key });

const MAX_CHAR_LIMIT = 500000; // Reduced to 500k for better performance/reliability
const CHUNK_SIZE = 3000;
const MAX_CHUNKS = 300;

const truncateText = (text: string) => {
  if (text.length <= MAX_CHAR_LIMIT) return text;
  return text.substring(0, MAX_CHAR_LIMIT) + "... [Truncated]";
};

const splitIntoChunks = (text: string, size: number): string[] => {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.substring(i, i + size));
  }
  return chunks;
};

export const StudyService = {
  getProvider(): AIProvider {
    const configs = providerManager.getConfigs();
    return configs.length > 0 ? configs[0].provider : "gemini";
  },

  async extractTextFromFile(file: File): Promise<{ text: string; title: string; isPossiblyScanned?: boolean; fileData?: string }> {
    const formData = new FormData();
    formData.append("pdf", file); // Multer expects "pdf" as the field name

    const response = await fetch("/api/extract-pdf", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("File Extraction API Error:", response.status, errorText);
      throw new Error(`Failed to extract text from file: ${response.status} ${errorText.substring(0, 100)}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Non-JSON response from API:", text.substring(0, 200));
      throw new Error("Server returned an unexpected response format. Please ensure the server is running correctly.");
    }

    const data = await response.json();
    
    let fileData: string | undefined;
    if (file.type === "application/pdf") {
      fileData = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(",")[1];
          resolve(base64String);
        };
        reader.readAsDataURL(file);
      });
    }

    // If text is empty and it's a PDF, we might need to handle it as a scanned document
    if (!data.text.trim() && file.type === "application/pdf") {
      return {
        text: "",
        title: data.title || file.name,
        isPossiblyScanned: true,
        fileData
      };
    }

    return {
      text: data.text,
      title: data.title || file.name,
      fileData
    };
  },

  async extractTextFromScannedFile(fileData: string): Promise<string> {
    const prompt = `
      Please extract all text from this scanned document accurately. 
      CRITICAL:
      - Maintain the original structure, including paragraph breaks.
      - Use double newlines between paragraphs to ensure readability.
      - If there are headings, keep them on their own lines.
      - Do not add any commentary, just the extracted text.
    `;
    
    return providerManager.runWithFailover(async (config) => {
      if (config.provider === "gemini") {
        const ai = getGeminiAI(config.key);
        const response = await ai.models.generateContent({
          model: config.model,
          contents: [
            { parts: [{ text: prompt }, { inlineData: { data: fileData, mimeType: "application/pdf" } }] }
          ],
        });
        return response.text;
      } else {
        throw new Error(`${config.provider} does not support direct PDF OCR in this implementation. Please use Gemini for scanned documents.`);
      }
    });
  },

  async generateStudyMaterials(
    text: string, 
    fileData?: string, 
    onProgress?: (progress: { current: number; total: number }) => void,
    chunkSize: number = 5000
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
      if (onProgress) onProgress({ current: 0, total: 1 }); // Indicate OCR started
      contentToAnalyze = await this.extractTextFromScannedFile(fileData);
    }

    if (!contentToAnalyze || contentToAnalyze.trim().length < 50) {
      throw new Error("The document contains too little text to analyze.");
    }

    // Split into smaller chunks for more frequent updates in Guided Reading
    const chunks = splitIntoChunks(contentToAnalyze, chunkSize).slice(0, MAX_CHUNKS);
    let completed = 0;
    if (onProgress) onProgress({ current: 0, total: chunks.length });
    
    const results = await Promise.all(chunks.map(async (chunk, index) => {
      const prompt = `
        Analyze the following section (${index + 1}/${chunks.length}) of a study document.
        
        Tasks:
        1. Summary: A concise overview.
        2. Key Concepts: Important terms and definitions.
        3. Practice Questions: 2 high-quality questions.
        4. Reading Guide:
           - 2 Pre-reading questions: What specific details should the reader look for in this section?
           - 3 Key takeaways: What are the most critical insights?

        CRITICAL: 
        - Return the result in JSON format.
        - Ensure all arrays are populated with relevant content.
        - DO NOT use double asterisks.
      `;

      return providerManager.runWithFailover(async (config) => {
        if (config.provider === "gemini") {
          const ai = getGeminiAI(config.key);
          const response = await ai.models.generateContent({
            model: config.model,
            contents: [{ parts: [{ text: `${prompt}\n\nDOCUMENT CONTENT SECTION:\n${chunk}` }] }],
            config: {
              systemInstruction: "You are a precise academic study assistant. You help readers improve speed and understanding.",
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
                      properties: {
                        concept: { type: Type.STRING },
                        definition: { type: Type.STRING },
                      },
                      required: ["concept", "definition"],
                    },
                  },
                  practiceQuestions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        question: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ["multiple-choice", "short-answer", "true-false", "numeric"] },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        answer: { type: Type.STRING },
                      },
                      required: ["question", "type", "answer"],
                    },
                  },
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
          completed++;
          if (onProgress) onProgress({ current: completed, total: chunks.length });
          return JSON.parse(response.text);
        } else if (config.provider === "anthropic") {
          const anthropic = getAnthropicAI(config.key);
          const response = await anthropic.messages.create({
            model: config.model,
            max_tokens: 4096,
            system: "You are a precise academic study assistant. You help readers improve speed and understanding. Always respond in valid JSON format.",
            messages: [{ role: "user", content: `${prompt}\n\nDOCUMENT CONTENT SECTION:\n${chunk}` }],
          });
          
          completed++;
          if (onProgress) onProgress({ current: completed, total: chunks.length });
          const content = response.content[0].type === 'text' ? response.content[0].text : '{}';
          return JSON.parse(content);
        } else {
          const client = 
            config.provider === "openai" ? getOpenAI(config.key) : 
            config.provider === "groq" ? getGroqAI(config.key) : 
            getGrokAI(config.key);
          
          const response = await client.chat.completions.create({
            model: config.model,
            messages: [
              { role: "system", content: "You are a precise academic study assistant. You help readers improve speed and understanding. Always respond in valid JSON format." },
              { role: "user", content: `${prompt}\n\nDOCUMENT CONTENT SECTION:\n${chunk}` }
            ],
            response_format: { type: "json_object" }
          });
          
          completed++;
          if (onProgress) onProgress({ current: completed, total: chunks.length });
          return JSON.parse(response.choices[0].message.content || "{}");
        }
      });
    }));

    const combinedSummaryText = results.map(r => r.summary).join("\n\n");
    let finalSummary = combinedSummaryText;

    // Final synthesis step to create a single cohesive paragraph
    try {
      const synthesisPrompt = `
        Based on the following section summaries of a document, write a single, cohesive, and comprehensive paragraph that summarizes the entire document. 
        CRITICAL:
        - The response MUST be exactly ONE paragraph.
        - Do not use bullet points or multiple paragraphs.
        - Capture the core message and most important findings.
        - Do not use double asterisks (**).
      `;

      finalSummary = await providerManager.runWithFailover(async (config) => {
        if (config.provider === "gemini") {
          const ai = getGeminiAI(config.key);
          const response = await ai.models.generateContent({
            model: config.model,
            contents: [{ parts: [{ text: `${synthesisPrompt}\n\nSECTION SUMMARIES:\n${combinedSummaryText}` }] }],
            config: { temperature: 0.3 }
          });
          return response.text.trim();
        } else if (config.provider === "anthropic") {
          const anthropic = getAnthropicAI(config.key);
          const response = await anthropic.messages.create({
            model: config.model,
            max_tokens: 1024,
            system: "You are a precise academic study assistant. Always respond with a single paragraph.",
            messages: [{ role: "user", content: `${synthesisPrompt}\n\nSECTION SUMMARIES:\n${combinedSummaryText}` }],
          });
          const content = response.content[0].type === 'text' ? response.content[0].text : '';
          return content.trim();
        } else {
          const client = 
            config.provider === "openai" ? getOpenAI(config.key) : 
            config.provider === "groq" ? getGroqAI(config.key) : 
            getGrokAI(config.key);
          const response = await client.chat.completions.create({
            model: config.model,
            messages: [
              { role: "system", content: "You are a precise academic study assistant. Always respond with a single paragraph." },
              { role: "user", content: `${synthesisPrompt}\n\nSECTION SUMMARIES:\n${combinedSummaryText}` }
            ],
          });
          return response.choices[0].message.content?.trim() || combinedSummaryText;
        }
      });
    } catch (error) {
      console.error("Failed to generate final summary synthesis:", error);
      // Fallback to combined text if synthesis fails
    }

    const combinedConcepts = Array.from(new Map(results.flatMap(r => r.keyConcepts).map(c => [c.concept, c])).values());
    const combinedQuestions = results.flatMap(r => r.practiceQuestions).slice(0, 10);
    
    // Combine reading guide elements
    const combinedGuide: ReadingGuide = {
      preReadingQuestions: results.flatMap(r => r.readingGuide.preReadingQuestions).slice(0, 5),
      keyTakeaways: results.flatMap(r => r.readingGuide.keyTakeaways).slice(0, 8),
      reflectivePrompt: "", 
      speedHighlights: [],
    };

    return {
      summary: finalSummary,
      keyConcepts: combinedConcepts,
      practiceQuestions: combinedQuestions,
      readingGuide: combinedGuide,
      chunkGuides: results.map(r => r.readingGuide)
    };
  },

  async generateMoreQuestions(text: string, existingQuestions: PracticeQuestion[]): Promise<PracticeQuestion[]> {
    const truncatedText = truncateText(text);
    const prompt = `
      Based on the following study document text, generate 5 NEW practice questions.
      DO NOT repeat any of the existing questions provided below.
      
      Existing Questions (to avoid):
      ${existingQuestions.map(q => q.question).join("\n")}

      Return the result in JSON format as an array of objects.
    `;

    return providerManager.runWithFailover(async (config) => {
      if (config.provider === "gemini") {
        const ai = getGeminiAI(config.key);
        const response = await ai.models.generateContent({
          model: config.model,
          contents: [{ parts: [{ text: prompt }, { text: truncatedText }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["multiple-choice", "short-answer", "true-false", "numeric"] },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  answer: { type: Type.STRING },
                },
                required: ["question", "type", "answer"],
              },
            },
          },
        });
        return JSON.parse(response.text);
      } else if (config.provider === "anthropic") {
        const anthropic = getAnthropicAI(config.key);
        const response = await anthropic.messages.create({
          model: config.model,
          max_tokens: 2048,
          system: "You are a precise academic study assistant. Always respond in valid JSON format.",
          messages: [{ role: "user", content: `${prompt}\n\nDOCUMENT CONTENT:\n${truncatedText}` }],
        });
        const content = response.content[0].type === 'text' ? response.content[0].text : '{}';
        const data = JSON.parse(content);
        return Array.isArray(data) ? data : (data.questions || []);
      } else {
        const client = 
          config.provider === "openai" ? getOpenAI(config.key) : 
          config.provider === "groq" ? getGroqAI(config.key) : 
          getGrokAI(config.key);
        
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: "You are a precise academic study assistant. Always respond in valid JSON format." },
            { role: "user", content: `${prompt}\n\nDOCUMENT CONTENT:\n${truncatedText}` }
          ],
          response_format: { type: "json_object" }
        });
        
        const data = JSON.parse(response.choices[0].message.content || "{}");
        return Array.isArray(data) ? data : (data.questions || []);
      }
    });
  },

  async generateTopicQuestions(text: string, topic: string): Promise<PracticeQuestion[]> {
    const truncatedText = truncateText(text);
    const prompt = `
      Based on the following document text, generate 5 practice questions SPECIFICALLY about the topic: "${topic}".
      Return the result in JSON format as an array of objects.
    `;

    return providerManager.runWithFailover(async (config) => {
      if (config.provider === "gemini") {
        const ai = getGeminiAI(config.key);
        const response = await ai.models.generateContent({
          model: config.model,
          contents: [{ parts: [{ text: prompt }, { text: truncatedText }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["multiple-choice", "short-answer", "true-false", "numeric"] },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  answer: { type: Type.STRING },
                },
                required: ["question", "type", "answer"],
              },
            },
          },
        });
        return JSON.parse(response.text);
      } else if (config.provider === "anthropic") {
        const anthropic = getAnthropicAI(config.key);
        const response = await anthropic.messages.create({
          model: config.model,
          max_tokens: 2048,
          system: "You are a precise academic study assistant. Always respond in valid JSON format.",
          messages: [{ role: "user", content: `${prompt}\n\nDOCUMENT CONTENT:\n${truncatedText}` }],
        });
        const content = response.content[0].type === 'text' ? response.content[0].text : '{}';
        const data = JSON.parse(content);
        return Array.isArray(data) ? data : (data.questions || []);
      } else {
        const client = 
          config.provider === "openai" ? getOpenAI(config.key) : 
          config.provider === "groq" ? getGroqAI(config.key) : 
          getGrokAI(config.key);
        
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: "You are a precise academic study assistant. Always respond in valid JSON format." },
            { role: "user", content: `${prompt}\n\nDOCUMENT CONTENT:\n${truncatedText}` }
          ],
          response_format: { type: "json_object" }
        });
        
        const data = JSON.parse(response.choices[0].message.content || "{}");
        return Array.isArray(data) ? data : (data.questions || []);
      }
    });
  },

  async askQuestion(documentText: string, userQuestion: string): Promise<string> {
    const truncatedText = truncateText(documentText);
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
      ${truncatedText}

      User Question:
      ${userQuestion}
    `;

    return providerManager.runWithFailover(async (config) => {
      if (config.provider === "gemini") {
        const ai = getGeminiAI(config.key);
        const response = await ai.models.generateContent({
          model: config.model,
          contents: prompt,
        });
        return response.text;
      } else if (config.provider === "anthropic") {
        const anthropic = getAnthropicAI(config.key);
        const response = await anthropic.messages.create({
          model: config.model,
          max_tokens: 4096,
          system: "You are a precise academic study assistant.",
          messages: [{ role: "user", content: prompt }],
        });
        return response.content[0].type === 'text' ? response.content[0].text : "I'm sorry, I couldn't generate an answer.";
      } else {
        const client = 
          config.provider === "openai" ? getOpenAI(config.key) : 
          config.provider === "groq" ? getGroqAI(config.key) : 
          getGrokAI(config.key);
        
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: "You are a precise academic study assistant." },
            { role: "user", content: prompt }
          ]
        });
        
        return response.choices[0].message.content || "I'm sorry, I couldn't generate an answer.";
      }
    });
  },
};
