import { localDb } from './db';
import { StudyDocument, StudySession, QuizResult } from '../types';
import { liveQuery } from 'dexie';

export class LocalDbService {
  // Documents
  static async addDocument(doc: StudyDocument, fileChunks?: string[], contentChunks?: string[]) {
    const id = await localDb.documents.add({
      ...doc,
      createdAt: new Date()
    });
    
    const docId = id.toString();

    if (fileChunks && fileChunks.length > 0) {
      await localDb.fileChunks.bulkAdd(
        fileChunks.map((data, index) => ({
          documentId: docId,
          index,
          data
        }))
      );
    }

    if (contentChunks && contentChunks.length > 0) {
      await localDb.contentChunks.bulkAdd(
        contentChunks.map((text, index) => ({
          documentId: docId,
          index,
          text
        }))
      );
    }

    return docId;
  }

  static async getDocument(id: string) {
    return await localDb.documents.get(Number(id));
  }

  static async updateDocument(id: string, changes: Partial<StudyDocument>) {
    await localDb.documents.update(Number(id), changes);
  }

  static async deleteDocument(id: string) {
    await localDb.documents.delete(Number(id));
    await localDb.fileChunks.where('documentId').equals(id).delete();
    await localDb.contentChunks.where('documentId').equals(id).delete();
    await localDb.sessions.where('documentId').equals(id).delete();
    await localDb.quizResults.where('documentId').equals(id).delete();
  }

  static async purgeDocumentContent(id: string) {
    await localDb.documents.update(Number(id), {
      extractedText: "",
      summary: "Content purged to save space. Re-upload or re-process to restore.",
      isPurged: true
    });
    await localDb.fileChunks.where('documentId').equals(id).delete();
    await localDb.contentChunks.where('documentId').equals(id).delete();
  }

  static async getFileChunks(documentId: string) {
    const chunks = await localDb.fileChunks
      .where('documentId')
      .equals(documentId)
      .sortBy('index');
    return chunks.map(c => c.data);
  }

  static async getContentChunks(documentId: string) {
    const chunks = await localDb.contentChunks
      .where('documentId')
      .equals(documentId)
      .sortBy('index');
    return chunks.map(c => c.text);
  }

  // Sessions
  static async addSession(session: StudySession) {
    return await localDb.sessions.add({
      ...session,
      startTime: new Date()
    });
  }

  // Quiz Results
  static async addQuizResult(result: QuizResult) {
    return await localDb.quizResults.add({
      ...result,
      timestamp: new Date()
    });
  }

  // Observables (for onSnapshot replacement)
  static observeDocuments(userId: string) {
    return liveQuery(() => 
      localDb.documents
        .where('userId')
        .equals(userId)
        .reverse()
        .sortBy('createdAt')
    );
  }

  static observeSessions(userId: string) {
    return liveQuery(() => 
      localDb.sessions
        .where('userId')
        .equals(userId)
        .toArray()
    );
  }

  static observeQuizResults(userId: string) {
    return liveQuery(() => 
      localDb.quizResults
        .where('userId')
        .equals(userId)
        .toArray()
    );
  }
}
