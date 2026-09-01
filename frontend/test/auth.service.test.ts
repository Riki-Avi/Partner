import './setup.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { firstValueFrom } from 'rxjs';
import { Injector } from '@angular/core';
import { AuthService } from '../src/app/core/services/auth.service.js';
import { ApiService } from '../src/app/core/services/api.service.js';
import { SocketService } from '../src/app/core/services/socket.service.js';
import { MockApiService, MockLocalStorage, MockSocketService } from './mocks/api.mock.js';
import type { User, AuthResponse } from '@voice-chat/shared';

describe('Frontend AuthService Tests', () => {
  let authService: AuthService;
  let mockApi: MockApiService;
  let mockStorage: MockLocalStorage;
  let mockSockets: MockSocketService;

  beforeEach(() => {
    mockApi = new MockApiService();
    mockStorage = new MockLocalStorage();
    mockSockets = new MockSocketService();

    (global as any).localStorage = mockStorage;

    const injector = Injector.create({
      providers: [
        { provide: AuthService, useClass: AuthService },
        { provide: ApiService, useValue: mockApi },
        { provide: SocketService, useValue: mockSockets },
      ],
    });

    authService = injector.get(AuthService);
  });

  it('should manage auth token persistence in storage', () => {
    authService.setToken('test-jwt-token');
    assert.equal(authService.getToken(), 'test-jwt-token');

    authService.clearToken();
    assert.equal(authService.getToken(), null);
  });

  it('should accept auth response and update currentUser and socket', async () => {
    const user: User = {
      id: 'u-1',
      email: 'user@example.com',
      name: 'User One',
      level: 'beginner',
      created_at: new Date().toISOString(),
    };
    const authRes: AuthResponse = {
      success: true,
      data: {
        user,
        token: 'jwt-12345',
      },
    };

    mockApi.setResponse('/auth/login', authRes);

    const result = await firstValueFrom(
      authService.login({ email: 'user@example.com', password: 'password123' }),
    );
    assert.equal(result.data.token, 'jwt-12345');
    assert.equal(authService.getToken(), 'jwt-12345');
    assert.equal(mockSockets.connected, true);

    const currentUser = await firstValueFrom(authService.currentUser$);
    assert.ok(currentUser);
    assert.equal(currentUser.email, 'user@example.com');

    const isAuth = await firstValueFrom(authService.isAuthenticated$);
    assert.equal(isAuth, true);
  });

  it('should authenticate as guest with loginAsGuest', async () => {
    const guestUser: User = {
      id: 'g-1',
      email: 'guest_123@guest.voicechat.local',
      name: 'Guest Learner',
      level: 'beginner',
      created_at: new Date().toISOString(),
    };
    const guestRes: AuthResponse = {
      success: true,
      data: {
        user: guestUser,
        token: 'guest-jwt-token',
      },
    };

    mockApi.setResponse('/auth/guest', guestRes);

    const result = await firstValueFrom(authService.loginAsGuest());
    assert.equal(result.data.token, 'guest-jwt-token');
    assert.equal(authService.getToken(), 'guest-jwt-token');
    assert.equal(mockSockets.connected, true);

    const currentUser = await firstValueFrom(authService.currentUser$);
    assert.equal(currentUser?.name, 'Guest Learner');
  });

  it('should clear session on logout', async () => {
    authService.setToken('existing-token');
    mockApi.setResponse('/auth/logout', { success: true, data: null });

    await firstValueFrom(authService.logout());
    assert.equal(authService.getToken(), null);
    assert.equal(mockSockets.connected, false);

    const currentUser = await firstValueFrom(authService.currentUser$);
    assert.equal(currentUser, null);
  });
});
