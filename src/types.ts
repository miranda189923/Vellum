export interface KeyConcept {
  concept: string;
  definition: string;
}

export interface PracticeQuestion {
  question: string;
  type: "multiple-choice" | "short-answer" | "true-false" | "numeric";
  options?: string[];
  answer: string;
}

export interface ReadingGuide {
  preReadingQuestions: string[];
  keyTakeaways: string[];
  reflectivePrompt: string;
  speedHighlights: string[];
}

export interface StudyDocument {
  id?: string;
  userId: string;
  title: string;
  fileName: string;
  extractedText: string;
  isLarge?: boolean;
  chunkCount?: number;
  fileChunkCount?: number;
  summary?: string;
  keyConcepts?: KeyConcept[];
  practiceQuestions?: PracticeQuestion[];
  readingGuide?: ReadingGuide;
  chunkGuides?: ReadingGuide[];
  fileData?: string; // base64 encoded PDF
  createdAt: any;
  totalStudyTime: number;
  isPurged?: boolean;
}

export interface StudySession {
  id?: string;
  userId: string;
  documentId: string;
  startTime: any; // Firestore Timestamp
  duration: number; // in seconds
  notes?: string;
}

export interface QuizResult {
  id?: string;
  userId: string;
  documentId: string;
  score: number; // e.g. 80 for 80%
  totalQuestions: number;
  correctAnswers: number;
  timestamp: any; // Firestore Timestamp
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  totalStudyTime: number;
  documentsCount: number;
}
