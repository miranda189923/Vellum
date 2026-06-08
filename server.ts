import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import cors from "cors";
import { createRequire } from "module";
import fs from "fs";
import * as dotenv from "dotenv";
import { aiService } from "./aiService";

// Load environment variables from .env file
dotenv.config();

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: "uploads/" });

import { Request } from "express";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- AI proxy routes: provider API keys stay on the server and never reach the browser ---
  app.get("/api/ai/info", (req, res) => {
    res.json(aiService.info());
  });

  const aiRoute = (handler: (body: any) => Promise<unknown>) =>
    async (req: express.Request, res: express.Response) => {
      try {
        res.json(await handler(req.body ?? {}));
      } catch (err: any) {
        console.error("AI request failed:", err?.message || err);
        res.status(err?.status || 500).json({ error: err?.message || "AI request failed" });
      }
    };

  app.post("/api/ai/ocr", aiRoute((b) => aiService.ocr(b.fileData)));
  app.post("/api/ai/analyze-chunk", aiRoute((b) => aiService.analyzeChunk(b.chunk, b.index, b.total)));
  app.post("/api/ai/synthesize", aiRoute((b) => aiService.synthesize(b.summaries)));
  app.post("/api/ai/more-questions", aiRoute((b) => aiService.moreQuestions(b.text, b.existingQuestions ?? [])));
  app.post("/api/ai/topic-questions", aiRoute((b) => aiService.topicQuestions(b.text, b.topic)));
  app.post("/api/ai/ask", aiRoute((b) => aiService.ask(b.documentText, b.userQuestion)));

  // File extraction (PDF and plain text)
  app.post("/api/extract-pdf", upload.single("pdf"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const dataBuffer = fs.readFileSync(req.file.path);
      let extractedText = "";

      // Detect PDF by magic bytes or extension
      const isPdf = req.file.originalname.toLowerCase().endsWith(".pdf") ||
                    (dataBuffer.length > 4 && dataBuffer.slice(0, 4).toString() === "%PDF");

      if (isPdf) {
        const data = await pdf(dataBuffer);
        extractedText = data.text;
      } else {
        extractedText = dataBuffer.toString("utf-8");
      }

      fs.unlinkSync(req.file.path);

      res.json({
        text: extractedText,
        title: req.file.originalname,
        isPossiblyScanned: !extractedText.trim() && isPdf,
      });
    } catch (error) {
      console.error("File extraction error:", error);
      res.status(500).json({
        error: "Failed to extract text from file",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Catch-all for unmatched API routes to prevent falling back to SPA index.html
  app.all("/api/*", (req, res) => {
    console.warn(`Unmatched API request: ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Global Error Handler for API
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Server Error:", err);
    if (req.path.startsWith("/api/")) {
      return res.status(err.status || 500).json({
        error: err.message || "Internal Server Error",
        details: process.env.NODE_ENV === "development" ? err.stack : undefined
      });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
