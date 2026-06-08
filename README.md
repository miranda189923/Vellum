# Vellum

**Vellum** is a local-first AI study companion that turns documents into summaries, key concepts, quizzes, guided reading, and interactive chat while keeping your data on your device.

![CI](https://github.com/miranda189923/Vellum/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)

🔗 **Demo:**

![Demo](demo.gif)

---

## Why Vellum?

Most AI study tools upload your documents to the cloud and read your data. Vellum is private and offline-friendly: documents and study history live locally in your browser, while AI provider keys stay securely on the server and never touch the client.

Built for students, researchers, and self-learners.

---

## Features

- **Automatic study materials** — summaries, key concepts, and practice quizzes from any upload (PDF or text).
- **Guided reading** — pre-reading questions and key takeaways generated per section.
- **Document chat** — ask questions and get structured, math-formatted (KaTeX) answers grounded in the document.
- **Local-first storage** — documents and progress are kept on-device with IndexedDB (Dexie).
- **Provider-agnostic** — Gemini, OpenAI, Anthropic, Groq, Grok, or OpenRouter, with automatic failover.

---

## Architecture

```
Browser (React/Vite)            Server (Express)              AI Providers
─────────────────────           ────────────────              ────────────
studyService  ── fetch ──▶  /api/ai/*  ──▶  aiService  ──▶  Gemini / OpenAI /
(chunking, retry,           (keys from env,                 Anthropic / Groq /
 progress, IndexedDB)        failover, JSON                  OpenRouter ...
                             normalization)
```

- **Keys never reach the browser.** All provider calls run server-side in `aiService.ts`; the client
  (`studyService.ts`) only talks to the app's own `/api/ai/*` routes.
- **Resilient by design.** Per-request timeouts, retry with exponential backoff, bounded concurrency,
  and provider failover keep long documents from stalling on slow or rate-limited models.
- **Tolerant parsing.** Model output is normalized server-side (`normalize.ts`), so providers that
  don't enforce a strict schema can't break the UI.

---

## Tech stack

React 19 · TypeScript · Vite · Express · Tailwind CSS · Dexie (IndexedDB) · Vitest

---

## Getting started

**Prerequisites:** Node 18+ and an API key for at least one supported provider.

```bash
git clone https://github.com/miranda189923/Vellum.git
cd Vellum
npm install
cp .env.example .env      # then add a provider key (see below)
npm run dev               # http://localhost:3000
```

Configure a provider in `.env` (keys are read server-side only):

```env
AI_CONFIGS='[{"provider":"openai","key":"YOUR_KEY","model":"gpt-4o-mini"}]'
```

You can list multiple providers; Vellum fails over to the next one on rate limits or outages.

---

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the dev server on port 3000    |
| `npm run build` | Production build                     |
| `npm run lint`  | Type-check with `tsc --noEmit`       |
| `npm test`      | Run the unit tests (Vitest)          |