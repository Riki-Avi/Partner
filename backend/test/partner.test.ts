import 'dotenv/config';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/services/database.service.js';
import { createMockSupabaseClient, createMockStore } from './mocks/supabase.mock.js';

describe('Partner Preferences, Recommendations, and Chat Memory Tests', () => {
  let store: ReturnType<typeof createMockStore>;
  let mockSupabase: any;
  let databaseService: DatabaseService;
  const testUserId = 'test-partner-user-1';

  beforeEach(async () => {
    store = createMockStore();
    mockSupabase = createMockSupabaseClient(store);
    databaseService = new DatabaseService(mockSupabase);

    await databaseService.createUser(testUserId, 'partner@test.com', 'Partner Learner');
  });

  it('should save and update user preferences', async () => {
    const defaultPrefs = await databaseService.getUserPreferences(testUserId);
    assert.equal(defaultPrefs.tone, 'friendly');
    assert.equal(defaultPrefs.interests.length, 4);

    const updated = await databaseService.upsertUserPreferences(testUserId, {
      interests: ['movies', 'technology', 'gaming'],
      tone: 'intellectual',
      goals: ['professional-speaking'],
      custom_topics: 'Interested in machine learning and quantum computing',
    });

    assert.equal(updated.tone, 'intellectual');
    assert.equal(updated.interests.length, 3);
    assert.equal(updated.custom_topics, 'Interested in machine learning and quantum computing');
  });

  it('should save conversation feedback and compute satisfaction statistics', async () => {
    const conv = await databaseService.createConversation(testUserId, 'en', 'Movie Discussion');

    const feedback = await databaseService.saveConversationFeedback(testUserId, conv.id, {
      satisfaction_score: 5,
      tags: ['Natural voice 🎙️', 'Great topic 💡'],
      notes: 'Really loved talking about Christopher Nolan movies!',
    });

    assert.ok(feedback.id);
    assert.equal(feedback.satisfaction_score, 5);
    assert.equal(feedback.tags.length, 2);

    const stats = await databaseService.getFeedbackStats(testUserId);
    assert.equal(stats.totalRated, 1);
    assert.equal(stats.averageScore, 5);
    assert.ok(stats.topTags.some((t) => t.tag === 'Natural voice 🎙️'));
  });

  it('should save, retrieve, and toggle favorite recommendations with context reason', async () => {
    const recsToSave = [
      {
        category: 'topic' as const,
        title: 'Sci-Fi Universe Debate',
        description: 'Discuss plot twists in Interstellar and Dune.',
        starter_prompt: 'What was your reaction to the ending of Interstellar?',
        difficulty: 'intermediate' as const,
        context_reason: 'Inspired by your chat about cinema 🎬',
      },
      {
        category: 'challenge' as const,
        title: 'Quick Elevator Pitch',
        description: 'Describe your favorite project in 60 seconds.',
        starter_prompt: 'Imagine you just met a top tech leader in an elevator...',
        difficulty: 'advanced' as const,
        context_reason: 'Follow-up to your career discussion 🚀',
      },
    ];

    const saved = await databaseService.savePartnerRecommendations(testUserId, recsToSave);
    assert.equal(saved.length, 2);
    assert.equal(saved[0].context_reason, 'Inspired by your chat about cinema 🎬');

    // Toggle favorite
    const favorited = await databaseService.toggleFavoriteRecommendation(testUserId, saved[0].id);
    assert.equal(favorited.is_favorite, true);

    const unfavorited = await databaseService.toggleFavoriteRecommendation(testUserId, saved[0].id);
    assert.equal(unfavorited.is_favorite, false);
  });

  it('should extract rich chat memories including user statements, error types, and feedback', async () => {
    const conv = await databaseService.createConversation(testUserId, 'en', 'Japanese Food Trip');
    const msg1 = await databaseService.saveMessage(
      conv.id,
      'user',
      'I really enjoy eating ramen and sushi.',
    );
    await databaseService.saveMessage(
      conv.id,
      'assistant',
      'Japanese cuisine has such rich broth traditions!',
    );
    const msg2 = await databaseService.saveMessage(conv.id, 'user', 'Last year I go to Tokyo.');
    await databaseService.saveCorrection(
      msg2.id,
      testUserId,
      'verb-tense',
      'I go',
      'I went',
      'Use past simple.',
    );
    await databaseService.markMessageWithCorrections(msg2.id);

    await databaseService.saveConversationFeedback(testUserId, conv.id, {
      satisfaction_score: 5,
      tags: ['Great topic 💡'],
      notes: 'Fun speaking practice!',
    });

    const memories = await databaseService.getRecentChatMemoriesForPartner(testUserId, 5);
    assert.equal(memories.length, 1);
    assert.equal(memories[0].title, 'Japanese Food Trip');
    assert.equal(memories[0].userSnippets.length, 2);
    assert.ok(memories[0].userSnippets.includes('I really enjoy eating ramen and sushi.'));
    assert.ok(memories[0].errorTypes.includes('verb-tense'));
    assert.equal(memories[0].satisfactionScore, 5);
    assert.equal(memories[0].feedbackNotes, 'Fun speaking practice!');
  });
});
