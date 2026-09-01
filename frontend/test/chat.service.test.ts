import './setup.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { Injector } from '@angular/core';
import { ChatService } from '../src/app/core/services/chat.service.js';
import { ApiService } from '../src/app/core/services/api.service.js';
import { SocketService } from '../src/app/core/services/socket.service.js';
import { MockApiService, MockSocketService } from './mocks/api.mock.js';
import type { Conversation, Message } from '@voice-chat/shared';

describe('Frontend ChatService Tests', () => {
  let chatService: ChatService;
  let mockApi: MockApiService;
  let mockSockets: MockSocketService;

  beforeEach(() => {
    mockApi = new MockApiService();
    mockSockets = new MockSocketService();

    const injector = Injector.create({
      providers: [
        { provide: ChatService, useClass: ChatService },
        { provide: ApiService, useValue: mockApi },
        { provide: SocketService, useValue: mockSockets },
      ],
    });

    chatService = injector.get(ChatService);
  });

  it('should list conversations', async () => {
    const conversations: Conversation[] = [
      {
        id: 'c-1',
        user_id: 'u-1',
        started_at: new Date().toISOString(),
        ended_at: null,
        language: 'en',
        duration_seconds: 0,
        title: 'Morning Catch-up',
      },
    ];

    mockApi.setResponse('/conversations', { success: true, data: conversations });

    const result = await firstValueFrom(chatService.list());
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Morning Catch-up');
  });

  it('should create conversation with custom title and language', async () => {
    const created: Conversation = {
      id: 'c-2',
      user_id: 'u-1',
      started_at: new Date().toISOString(),
      ended_at: null,
      language: 'en',
      duration_seconds: 0,
      title: 'Coffee Chat',
    };

    mockApi.setResponse('/conversations', { success: true, data: created });

    const result = await firstValueFrom(chatService.create('en', 'Coffee Chat'));
    assert.equal(result.id, 'c-2');
    assert.equal(result.title, 'Coffee Chat');
  });

  it('should rename conversation', async () => {
    const updated: Conversation = {
      id: 'c-2',
      user_id: 'u-1',
      started_at: new Date().toISOString(),
      ended_at: null,
      language: 'en',
      duration_seconds: 0,
      title: 'Renamed Coffee Chat',
    };

    mockApi.setResponse('/conversations/c-2', { success: true, data: updated });

    const result = await firstValueFrom(chatService.rename('c-2', 'Renamed Coffee Chat'));
    assert.equal(result.title, 'Renamed Coffee Chat');
  });

  it('should fetch conversation messages', async () => {
    const messages: Message[] = [
      {
        id: 'm-1',
        conversation_id: 'c-2',
        role: 'user',
        content: 'Good morning!',
        timestamp: new Date().toISOString(),
        has_corrections: false,
      },
    ];

    mockApi.setResponse('/conversations/c-2/messages', { success: true, data: messages });

    const result = await firstValueFrom(chatService.loadMessages('c-2'));
    assert.equal(result.length, 1);
    assert.equal(result[0].content, 'Good morning!');
  });
});
