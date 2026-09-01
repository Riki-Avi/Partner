import './setup.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { Injector } from '@angular/core';
import { PartnerService } from '../src/app/core/services/partner.service.js';
import { ApiService } from '../src/app/core/services/api.service.js';
import { MockApiService } from './mocks/api.mock.js';
import type { PartnerSummaryResponse, PartnerRecommendation } from '@voice-chat/shared';

describe('Frontend PartnerService Tests', () => {
  let partnerService: PartnerService;
  let mockApi: MockApiService;

  beforeEach(() => {
    mockApi = new MockApiService();

    const injector = Injector.create({
      providers: [
        { provide: PartnerService, useClass: PartnerService },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    partnerService = injector.get(PartnerService);
  });

  it('should fetch partner summary', async () => {
    const mockSummary: PartnerSummaryResponse = {
      preferences: {
        id: 'pref-1',
        user_id: 'u-1',
        interests: ['movies', 'technology'],
        tone: 'friendly',
        goals: ['casual-fluency'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      recommendations: [
        {
          id: 'rec-1',
          user_id: 'u-1',
          category: 'topic',
          title: 'Sci-Fi Discussions',
          description: 'Explore futuristic concepts.',
          starter_prompt: 'What sci-fi universe would you live in?',
          difficulty: 'intermediate',
          is_favorite: false,
          context_reason: 'Inspired by your chat about movies 🎬',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      stats: {
        totalRated: 3,
        averageScore: 4.67,
        topTags: [{ tag: 'Great topic 💡', count: 3 }],
      },
    };

    mockApi.setResponse('/partner/summary', { success: true, data: mockSummary });

    const summary = await firstValueFrom(partnerService.getSummary());
    assert.equal(summary.preferences.tone, 'friendly');
    assert.equal(summary.recommendations.length, 1);
    assert.equal(
      summary.recommendations[0].context_reason,
      'Inspired by your chat about movies 🎬',
    );
    assert.equal(summary.stats.totalRated, 3);
  });

  it('should update user preferences', async () => {
    mockApi.setResponse('/partner/preferences', {
      success: true,
      data: {
        id: 'pref-1',
        user_id: 'u-1',
        interests: ['culture', 'travel'],
        tone: 'encouraging',
        goals: ['travel-ready'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const updated = await firstValueFrom(
      partnerService.updatePreferences({
        interests: ['culture', 'travel'],
        tone: 'encouraging',
        goals: ['travel-ready'],
      }),
    );

    assert.equal(updated.tone, 'encouraging');
    assert.equal(updated.interests.length, 2);
  });

  it('should toggle favorite status on recommendation', async () => {
    const updatedRec: PartnerRecommendation = {
      id: 'rec-1',
      user_id: 'u-1',
      category: 'topic',
      title: 'Sci-Fi Discussions',
      description: 'Explore futuristic concepts.',
      starter_prompt: 'What sci-fi universe would you live in?',
      difficulty: 'intermediate',
      is_favorite: true,
      context_reason: 'Inspired by your chat about movies 🎬',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockApi.setResponse('/partner/recommendations/rec-1/favorite', {
      success: true,
      data: updatedRec,
    });

    const result = await firstValueFrom(partnerService.toggleFavorite('rec-1'));
    assert.equal(result.is_favorite, true);
  });

  it('should save conversation feedback', async () => {
    mockApi.setResponse('/partner/feedback', {
      success: true,
      data: {
        id: 'fb-1',
        user_id: 'u-1',
        conversation_id: 'c-1',
        satisfaction_score: 5,
        tags: ['Natural voice 🎙️'],
        created_at: new Date().toISOString(),
      },
    });

    const feedback = await firstValueFrom(
      partnerService.saveFeedback('c-1', {
        satisfaction_score: 5,
        tags: ['Natural voice 🎙️'],
        notes: 'Awesome session!',
      }),
    );

    assert.equal(feedback.satisfaction_score, 5);
  });
});
