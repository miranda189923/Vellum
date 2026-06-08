import { describe, it, expect } from 'vitest';
import { normalizeChunk, normalizeQuestion } from '../normalize';

describe('normalizeQuestion', () => {
  it('wraps a bare string into a question object', () => {
    expect(normalizeQuestion('What is inertia?')).toEqual({
      question: 'What is inertia?',
      type: 'short-answer',
      answer: '',
    });
  });

  it('reads alternate keys and rejects an invalid type', () => {
    const q = normalizeQuestion({ prompt: 'Define X', type: 'essay', correct_answer: 'Y' });
    expect(q.question).toBe('Define X');
    expect(q.type).toBe('short-answer'); // 'essay' is not an allowed type
    expect(q.answer).toBe('Y');
  });
});

describe('normalizeChunk', () => {
  it('coerces snake_case keys and bare-string concepts into the expected shape', () => {
    const out = normalizeChunk({
      summary: 'S',
      key_concepts: ['Inertia'],
      practice_questions: ['Q1?'],
      reading_guide: { pre_reading_questions: ['P1'], key_takeaways: ['T1', 'T2'] },
    });
    expect(out.summary).toBe('S');
    expect(out.keyConcepts).toEqual([{ concept: 'Inertia', definition: '' }]);
    expect(out.practiceQuestions[0].question).toBe('Q1?');
    expect(out.readingGuide.preReadingQuestions).toEqual(['P1']);
    expect(out.readingGuide.keyTakeaways).toEqual(['T1', 'T2']);
  });

  it('returns empty arrays for missing fields instead of throwing', () => {
    const out = normalizeChunk({});
    expect(out.keyConcepts).toEqual([]);
    expect(out.practiceQuestions).toEqual([]);
    expect(out.readingGuide.preReadingQuestions).toEqual([]);
  });
});
