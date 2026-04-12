# Vellum

**Vellum** is an AI study companion that transforms documents into summaries, guided questions, quizzes, and interactive chat while keeping your data on your device.

---

## Why Vellum?

Most AI study tools upload your documents to the cloud.

Vellum keeps your study workflow **private, fast, and offline-friendly** using a local-first architecture powered by IndexedDB.

Perfect for:
- students
- researchers
- self-learners

---

## Demo

![Demo](https://github.com/miranda189923/Vellum/raw/main/demo.gif)

---

## Features

### Local-First Storage
Your documents and study history stay on your device using IndexedDB.

### Guided Reading
AI generates:
- pre-reading questions
- key takeaways
- evolving insights as you scroll

### Interactive Document Chat
Ask questions about your documents and get:
- structured answers
- contextual explanations
- math-formatted responses

### Automatic Study Materials
Generate:
- summaries
- key concepts
- practice quizzes

from any uploaded document.

---

## Setup

1. **Clone the repository**
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and add your API keys.
   ```bash
   cp .env.example .env
   ```
4. **Run the development server**:
   ```bash
   npm run dev
   ```