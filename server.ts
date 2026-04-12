import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import cors from "cors";
import { createRequire } from "module";
import fs from "fs";
import * as dotenv from "dotenv";

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

  // Logging middleware for all API requests
  app.use("/api", (req, res, next) => {
    console.log(`[API] ${req.method} ${req.path}`);
    next();
  });

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Expose AI configuration to the frontend (needed for client-side AI calls)
  app.get("/api/ai-config", (req, res) => {
    res.json({ 
      AI_CONFIGS: process.env.AI_CONFIGS || process.env.VITE_AI_CONFIGS || "",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || ""
    });
  });

  // API Route for file extraction (PDF and Text)
  app.post("/api/extract-pdf", (req, res, next) => {
    console.log("Received upload request to /api/extract-pdf");
    next();
  }, upload.single("pdf"), async (req: MulterRequest, res) => {
    console.log("Multer processed file:", req.file);
    try {
      if (!req.file) {
        console.error("No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      const dataBuffer = fs.readFileSync(req.file.path);
      console.log("Reading file buffer, size:", dataBuffer.length);
      
      let extractedText = "";
      
      // Check if it's a PDF by magic bytes or extension
      const isPdf = req.file.originalname.toLowerCase().endsWith(".pdf") || 
                    (dataBuffer.length > 4 && dataBuffer.slice(0, 4).toString() === "%PDF");

      if (isPdf) {
        const data = await pdf(dataBuffer);
        console.log("PDF parsed successfully, pages:", data.numpages);
        extractedText = data.text;
      } else {
        // Try reading as text
        extractedText = dataBuffer.toString("utf-8");
        console.log("File read as text, length:", extractedText.length);
      }

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        text: extractedText,
        title: req.file.originalname,
        isPossiblyScanned: !extractedText.trim() && isPdf
      });
    } catch (error) {
      console.error("File Extraction Error:", error);
      res.status(500).json({ 
        error: "Failed to extract text from file",
        details: error instanceof Error ? error.message : String(error)
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
