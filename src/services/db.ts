import Dexie, { Table } from 'dexie';
import { StudyDocument, StudySession, QuizResult } from '../types';

export interface FileChunk {
  id?: number;
  documentId: string;
  index: number;
  data: string;
}

export interface ContentChunk {
  id?: number;
  documentId: string;
  index: number;
  text: string;
}

export class VellumDatabase extends Dexie {
  documents!: Table<StudyDocument>;
  sessions!: Table<StudySession>;
  quizResults!: Table<QuizResult>;
  fileChunks!: Table<FileChunk>;
  contentChunks!: Table<ContentChunk>;

  constructor() {
    super('VellumDatabase');
    this.version(1).stores({
      documents: '++id, userId, title, createdAt',
      sessions: '++id, userId, documentId, startTime',
      quizResults: '++id, userId, documentId, timestamp',
      fileChunks: '++id, documentId, index',
      contentChunks: '++id, documentId, index'
    });
  }
}

export const localDb = new VellumDatabase();
