import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  User,
  Conversation,
  Message,
  Correction,
  PartnerRecommendation,
  UserPreferences,
  ConversationFeedback,
  ChatMemorySnippet,
  LoginRequest,
  SignupRequest,
} from '../index.js';

describe('Shared Types and Contract Tests', () => {
  it('should validate structure for User and Conversation interfaces', () => {
    const user: User = {
      id: 'usr-1',
      email: 'test@example.com',
      name: 'Test',
      level: 'beginner',
      created_at: new Date().toISOString(),
    };
    assert.equal(user.email, 'test@example.com');
    assert.equal(user.level, 'beginner');

    const conv: Conversation = {
      id: 'conv-1',
      user_id: user.id,
      started_at: new Date().toISOString(),
      ended_at: null,
      language: 'en',
      duration_seconds: 0,
      title: 'Practice',
    };
    assert.equal(conv.language, 'en');
    assert.equal(conv.ended_at, null);
  });

  it('should validate PartnerRecommendation and ChatMemorySnippet interfaces', () => {
    const rec: PartnerRecommendation = {
      id: 'rec-1',
      user_id: 'usr-1',
      category: 'topic',
      title: 'Space Exploration',
      description: 'Discuss Mars missions.',
      starter_prompt: 'Would you travel to Mars?',
      difficulty: 'intermediate',
      is_favorite: true,
      context_reason: 'Inspired by your science chat 🚀',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    assert.equal(rec.category, 'topic');
    assert.equal(rec.context_reason, 'Inspired by your science chat 🚀');
    assert.equal(rec.is_favorite, true);

    const memory: ChatMemorySnippet = {
      conversationId: 'c-1',
      title: 'Travel',
      startedAt: new Date().toISOString(),
      userSnippets: ['I love flying'],
      assistantSnippets: ['Aviation is fascinating!'],
      errorTypes: ['grammar'],
      satisfactionScore: 5,
      feedbackNotes: 'Great practice session',
    };
    assert.equal(memory.userSnippets.length, 1);
    assert.equal(memory.satisfactionScore, 5);
  });
});
