import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiService } from '../src/services/gemini.service.js';

describe('GeminiService Unit Tests', () => {
  const gemini = new GeminiService();

  it('should parse valid tutor JSON reply and filter fabricated corrections', () => {
    const rawResponse = JSON.stringify({
      reply: 'Great job! Keep practicing.',
      corrections: [
        {
          errorType: 'grammar',
          original: 'She go',
          corrected: 'She goes',
          explanation: 'Use -s for third person.',
        },
        {
          errorType: 'spelling',
          original: 'fabricated error not in message',
          corrected: 'something else',
          explanation: 'Should be discarded.',
        },
      ],
    });

    const userMessage = 'She go to the park yesterday.';
    const parsed = (gemini as any).parseTurn(rawResponse, userMessage);

    assert.equal(parsed.reply, 'Great job! Keep practicing.');
    assert.equal(parsed.corrections.length, 1);
    assert.equal(parsed.corrections[0].original, 'She go');
    assert.equal(parsed.corrections[0].corrected, 'She goes');
  });

  it('should handle markdown code fences cleanly in JSON parsing', () => {
    const rawResponse = '```json\n{"reply": "Hello there!", "corrections": []}\n```';
    const userMessage = 'Hello!';
    const parsed = (gemini as any).parseTurn(rawResponse, userMessage);

    assert.equal(parsed.reply, 'Hello there!');
    assert.equal(parsed.corrections.length, 0);
  });

  it('should parse partner recommendations with category, difficulty, and contextReason', () => {
    const rawRecommendations = JSON.stringify({
      recommendations: [
        {
          category: 'topic',
          title: 'Exploring Sci-Fi Classics',
          description: 'Dive deep into futuristic storytelling.',
          starterPrompt: 'What sci-fi movie blew your mind recently?',
          contextReason: 'Inspired by your chat about cinema 🎬',
          difficulty: 'intermediate',
        },
        {
          category: 'roleplay',
          title: 'Ordering at a London Pub',
          description: 'Practice British pub etiquette and food ordering.',
          starterPrompt: 'Evening mate! What can I get for you?',
          contextReason: 'Practical travel roleplay 🍺',
          difficulty: 'beginner',
        },
      ],
    });

    const parsed = (gemini as any).parseRecommendations(rawRecommendations, 'intermediate');

    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].category, 'topic');
    assert.equal(parsed[0].contextReason, 'Inspired by your chat about cinema 🎬');
    assert.equal(parsed[1].category, 'roleplay');
    assert.equal(parsed[1].contextReason, 'Practical travel roleplay 🍺');
  });

  it('should validate and normalize error types to taxonomy', () => {
    assert.equal((gemini as any).validErrorType('GRAMMAR'), 'grammar');
    assert.equal((gemini as any).validErrorType('Verb-Tense'), 'verb-tense');
    assert.equal((gemini as any).validErrorType(''), 'other');
    assert.equal((gemini as any).validErrorType(undefined), 'other');
  });
});
