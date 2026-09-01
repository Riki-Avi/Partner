import './setup.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { Injector } from '@angular/core';
import { AdventureService } from '../src/app/core/services/adventure.service.js';
import { ApiService } from '../src/app/core/services/api.service.js';
import { MockApiService } from './mocks/api.mock.js';
import type { StoryAdventure, AdventureTurnResponse } from '@voice-chat/shared';

describe('Frontend AdventureService Tests', () => {
  let adventureService: AdventureService;
  let mockApi: MockApiService;

  beforeEach(() => {
    mockApi = new MockApiService();

    const injector = Injector.create({
      providers: [
        { provide: AdventureService, useClass: AdventureService },
        { provide: ApiService, useValue: mockApi },
      ],
    });

    adventureService = injector.get(AdventureService);
  });

  it('should fetch active adventure with getCurrent', async () => {
    const mockAdv: StoryAdventure = {
      id: 'adv-1',
      user_id: 'u-1',
      title: 'The Wandering Blade of Ionia',
      theme: 'Swordsmanship',
      setting: 'Shrine of the wind',
      summary: 'Beginning the quest.',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      characters: [
        {
          id: 'c-1',
          adventure_id: 'adv-1',
          name: 'Master Shen',
          role: 'guide',
          personality: 'Wise mentor',
          avatar_emoji: '🧙‍♂️',
          voice_pitch: 0.9,
          created_at: new Date().toISOString(),
        },
      ],
      turns: [
        {
          id: 't-1',
          adventure_id: 'adv-1',
          speaker_role: 'narrator',
          speaker_name: 'Narrator',
          content: 'The journey begins.',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    mockApi.setResponse('/adventures/current', { success: true, data: mockAdv });

    const result = await firstValueFrom(adventureService.getCurrent());
    assert.equal(result.id, 'adv-1');
    assert.equal(result.title, 'The Wandering Blade of Ionia');
    assert.equal(result.characters.length, 1);
  });

  it('should send user dialogue turn and receive companion replies', async () => {
    const turnResponse: AdventureTurnResponse = {
      userTurn: {
        id: 't-2',
        adventure_id: 'adv-1',
        speaker_role: 'user',
        speaker_name: 'You',
        content: 'I take the mountain trail.',
        timestamp: new Date().toISOString(),
      },
      characterReplies: [
        {
          id: 't-3',
          adventure_id: 'adv-1',
          speaker_role: 'guide',
          speaker_name: 'Master Shen',
          content: 'A bold choice. Stay alert.',
          action_chips: ['"I am ready."'],
          timestamp: new Date().toISOString(),
        },
      ],
      adventure: {
        id: 'adv-1',
        user_id: 'u-1',
        title: 'The Wandering Blade of Ionia',
        theme: 'Swordsmanship',
        setting: 'Shrine of the wind',
        summary: 'Ascending the mountain.',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        characters: [],
        turns: [],
      },
    };

    mockApi.setResponse('/adventures/turn', { success: true, data: turnResponse });

    const result = await firstValueFrom(adventureService.sendTurn('I take the mountain trail.'));
    assert.equal(result.userTurn.content, 'I take the mountain trail.');
    assert.equal(result.characterReplies.length, 1);
    assert.equal(result.characterReplies[0].speaker_name, 'Master Shen');
  });

  it('should reset adventure', async () => {
    const resetAdv: StoryAdventure = {
      id: 'adv-2',
      user_id: 'u-1',
      title: 'New Story Realm',
      theme: 'Exploration',
      setting: 'Mystic sea',
      summary: 'New voyage.',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      characters: [],
      turns: [],
    };

    mockApi.setResponse('/adventures/reset', { success: true, data: resetAdv });

    const result = await firstValueFrom(adventureService.resetAdventure());
    assert.equal(result.id, 'adv-2');
    assert.equal(result.title, 'New Story Realm');
  });
});
