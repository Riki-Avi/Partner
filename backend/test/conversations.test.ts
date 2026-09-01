import 'dotenv/config';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/services/database.service.js';
import { createMockSupabaseClient, createMockStore } from './mocks/supabase.mock.js';

describe('Conversations and Messages Tests', () => {
  let store: ReturnType<typeof createMockStore>;
  let mockSupabase: any;
  let databaseService: DatabaseService;
  const testUserId = 'test-user-uuid-1';
  const anotherUserId = 'other-user-uuid-2';

  beforeEach(async () => {
    store = createMockStore();
    mockSupabase = createMockSupabaseClient(store);
    databaseService = new DatabaseService(mockSupabase);

    await databaseService.createUser(testUserId, 'user1@test.com', 'User One');
    await databaseService.createUser(anotherUserId, 'user2@test.com', 'User Two');
  });

  it('should create and retrieve a conversation for a user', async () => {
    const conv = await databaseService.createConversation(testUserId, 'en', 'Travel Stories');
    assert.ok(conv.id);
    assert.equal(conv.user_id, testUserId);
    assert.equal(conv.title, 'Travel Stories');
    assert.equal(conv.ended_at, null);

    const retrieved = await databaseService.getOwnedConversation(conv.id, testUserId);
    assert.ok(retrieved);
    assert.equal(retrieved.id, conv.id);
  });

  it('should not allow another user to access owned conversation', async () => {
    const conv = await databaseService.createConversation(testUserId, 'en', 'Private Chat');
    const accessByOther = await databaseService.getOwnedConversation(conv.id, anotherUserId);
    assert.equal(accessByOther, null);
  });

  it('should rename a conversation', async () => {
    const conv = await databaseService.createConversation(testUserId, 'en', 'Initial Title');
    const renamed = await databaseService.renameOwnedConversation(
      conv.id,
      testUserId,
      'New Catchy Title',
    );
    assert.equal(renamed.title, 'New Catchy Title');
  });

  it('should save messages and handle corrections', async () => {
    const conv = await databaseService.createConversation(testUserId, 'en', 'Grammar Practice');

    const userMsg = await databaseService.saveMessage(conv.id, 'user', 'She go to the store.');
    assert.equal(userMsg.content, 'She go to the store.');
    assert.equal(userMsg.has_corrections, false);

    const corr = await databaseService.saveCorrection(
      userMsg.id,
      testUserId,
      'grammar',
      'She go',
      'She goes',
      'Use third-person singular.',
    );
    await databaseService.markMessageWithCorrections(userMsg.id);

    assert.ok(corr.id);
    assert.equal(corr.error_type, 'grammar');

    const msgs = await databaseService.getConversationMessages(conv.id);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].has_corrections, true);
  });

  it('should end and delete a conversation', async () => {
    const conv = await databaseService.createConversation(testUserId, 'en', 'Short Session');
    const ended = await databaseService.endOwnedConversation(conv.id, testUserId);
    assert.ok(ended.ended_at);
    assert.equal(typeof ended.duration_seconds, 'number');

    await databaseService.deleteOwnedConversation(conv.id, testUserId);
    const deleted = await databaseService.getOwnedConversation(conv.id, testUserId);
    assert.equal(deleted, null);
  });
});
