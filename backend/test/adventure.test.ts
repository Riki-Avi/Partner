import 'dotenv/config';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/services/database.service.js';
import { AdventureController } from '../src/controllers/adventure.controller.js';
import { createMockSupabaseClient, createMockStore } from './mocks/supabase.mock.js';

describe('Story Adventure Mode Tests', () => {
  let store: ReturnType<typeof createMockStore>;
  let mockSupabase: any;
  let db: DatabaseService;
  let controller: AdventureController;
  const userId = 'user-adv-1';

  beforeEach(async () => {
    store = createMockStore();
    mockSupabase = createMockSupabaseClient(store);
    db = new DatabaseService(mockSupabase);
    controller = new AdventureController();

    // Create test user
    await db.createUser(userId, 'player@example.com', 'Adventurer', 'intermediate');
  });

  it('should create and retrieve active adventure with party characters and turns', async () => {
    const adv = await db.createAdventure(userId, {
      title: 'The Wandering Blade of Ionia',
      theme: 'Swordsmanship & Stoic Philosophy',
      setting: 'Ancient shrine in the bamboo forests of Ionia.',
      summary: 'Journey along the wind shrine road.',
      characters: [
        {
          name: 'Master Shen',
          role: 'guide',
          personality: 'Wise mentor',
          avatar_emoji: '🧙‍♂️',
          voice_pitch: 0.9,
        },
        {
          name: 'Kiko',
          role: 'playful',
          personality: 'Fox scout',
          avatar_emoji: '🦊',
          voice_pitch: 1.2,
        },
        {
          name: 'Kaelen',
          role: 'serious',
          personality: 'Stoic swordsman',
          avatar_emoji: '⚔️',
          voice_pitch: 0.8,
        },
      ],
      initialTurns: [
        {
          speaker_role: 'narrator',
          speaker_name: 'Narrator',
          content: 'The wind whispers through the bamboo forest.',
        },
        {
          speaker_role: 'guide',
          speaker_name: 'Master Shen',
          content: 'Keep your mind calm and your blade sharp.',
          action_chips: ['"I choose the mountain shrine trail."'],
        },
      ],
    });

    assert.ok(adv.id);
    assert.equal(adv.title, 'The Wandering Blade of Ionia');
    assert.equal(adv.characters.length, 3);
    assert.equal(adv.turns.length, 2);

    const active = await db.getActiveAdventure(userId);
    assert.ok(active);
    assert.equal(active.id, adv.id);
    assert.equal(active.characters.length, 3);
  });

  it('should append player turn and companion replies to the story', async () => {
    const adv = await db.createAdventure(userId, {
      title: 'The Great Journey',
      theme: 'Exploration',
      setting: 'Coastal harbor',
      summary: 'Preparing to set sail.',
      characters: [
        {
          name: 'Captain Rowan',
          role: 'guide',
          personality: 'Experienced navigator',
          avatar_emoji: '🧭',
          voice_pitch: 1.0,
        },
      ],
      initialTurns: [
        {
          speaker_role: 'narrator',
          speaker_name: 'Narrator',
          content: 'The harbor bell tolls.',
        },
      ],
    });

    const turnRes = await db.addAdventureUserTurnAndReplies(adv.id, userId, {
      userTurn: {
        speaker_role: 'user',
        speaker_name: 'Adventurer',
        content: 'I want to check our navigation map first.',
        corrections: [],
        action_chips: [],
      },
      characterReplies: [
        {
          speaker_role: 'guide',
          speaker_name: 'Captain Rowan',
          content: 'A wise precaution! The reefs to the north are treacherous.',
          corrections: [],
          action_chips: ['"Let us steer towards the open water."'],
        },
      ],
      newSummary: 'Map reviewed; ready to depart.',
    });

    assert.equal(turnRes.userTurn.content, 'I want to check our navigation map first.');
    assert.equal(turnRes.characterReplies.length, 1);
    assert.equal(turnRes.adventure.summary, 'Map reviewed; ready to depart.');
    assert.equal(turnRes.adventure.turns.length, 3);
  });

  it('should archive active adventures when generating a new one', async () => {
    const adv1 = await db.createAdventure(userId, {
      title: 'Adventure One',
      theme: 'Theme 1',
      setting: 'Setting 1',
      summary: 'Summary 1',
      characters: [],
      initialTurns: [],
    });

    assert.equal(adv1.status, 'active');

    const adv2 = await db.createAdventure(userId, {
      title: 'Adventure Two',
      theme: 'Theme 2',
      setting: 'Setting 2',
      summary: 'Summary 2',
      characters: [],
      initialTurns: [],
    });

    const active = await db.getActiveAdventure(userId);
    assert.equal(active?.id, adv2.id);
    assert.equal(active?.title, 'Adventure Two');
  });
});
