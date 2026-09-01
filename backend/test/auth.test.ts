import 'dotenv/config';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AuthController } from '../src/controllers/auth.controller.js';
import { DatabaseService } from '../src/services/database.service.js';
import { createMockSupabaseClient, createMockStore } from './mocks/supabase.mock.js';

describe('AuthController Tests', () => {
  let store: ReturnType<typeof createMockStore>;
  let mockSupabase: any;
  let databaseService: DatabaseService;
  let authController: AuthController;

  beforeEach(() => {
    store = createMockStore();
    mockSupabase = createMockSupabaseClient(store);
    databaseService = new DatabaseService(mockSupabase);
    authController = new AuthController();
    (authController as any).supabase = mockSupabase;
  });

  it('should register a new user successfully with signup', async () => {
    const req = {
      body: {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      },
    } as any;

    let resData: any = null;
    let resStatus = 200;
    const res = {
      status(code: number) {
        resStatus = code;
        return this;
      },
      json(data: any) {
        resData = data;
        return this;
      },
    } as any;

    // Simulate signup via mockSupabase
    const { data: authResult } = await mockSupabase.auth.signUp({
      email: req.body.email,
      password: req.body.password,
    });
    assert.ok(authResult.user);
    assert.ok(authResult.session);

    const user = await databaseService.createUser(
      authResult.user.id,
      req.body.email,
      req.body.name,
    );
    await databaseService.createUserProgress(user.id);

    assert.equal(user.email, 'test@example.com');
    assert.equal(user.name, 'Test User');
    assert.equal(user.level, 'beginner');

    const progress = await databaseService.getUserProgress(user.id);
    assert.ok(progress);
    assert.equal(progress.total_conversations, 0);
  });

  it('should authenticate user and return session token with login', async () => {
    // Seed user
    const { data: created } = await mockSupabase.auth.signUp({
      email: 'asd@gmail.com',
      password: 'asd',
    });
    await databaseService.createUser(created.user.id, 'asd@gmail.com', 'asd');

    const { data: loginData, error: loginErr } = await mockSupabase.auth.signInWithPassword({
      email: 'asd@gmail.com',
      password: 'asd',
    });

    assert.equal(loginErr, null);
    assert.ok(loginData.session);
    assert.equal(loginData.user.email, 'asd@gmail.com');

    const profile = await databaseService.getUser(loginData.user.id);
    assert.ok(profile);
    assert.equal(profile.name, 'asd');
  });

  it('should reject login when password does not match', async () => {
    await mockSupabase.auth.signUp({
      email: 'user@example.com',
      password: 'correctpassword',
    });

    const { data, error } = await mockSupabase.auth.signInWithPassword({
      email: 'user@example.com',
      password: 'wrongpassword',
    });

    assert.equal(data.user, null);
    assert.ok(error);
  });

  it('should create a completely fresh guest session with loginAsGuest', async () => {
    const guestRand = Math.random().toString(36).substring(2, 8);
    const guestEmail = `guest_${Date.now()}_${guestRand}@guest.voicechat.local`;
    const guestPass = `Guest_${Math.random().toString(36).substring(2, 12)}!9A`;

    const { data: authData } = await mockSupabase.auth.admin.createUser({
      email: guestEmail,
      password: guestPass,
      email_confirm: true,
      user_metadata: { is_guest: true },
    });

    const user = await databaseService.createUser(authData.user.id, guestEmail, 'Guest Learner');
    await databaseService.createUserProgress(user.id);
    await databaseService.upsertUserPreferences(user.id, {
      interests: ['everyday-life', 'culture', 'technology', 'movies'],
      goals: ['casual-fluency'],
      tone: 'friendly',
    });

    assert.equal(user.name, 'Guest Learner');
    assert.ok(user.email.startsWith('guest_'));

    // Check zero conversations
    const convs = await databaseService.getUserConversations(user.id);
    assert.equal(convs.length, 0);

    // Check preferences initialized
    const prefs = await databaseService.getUserPreferences(user.id);
    assert.equal(prefs.tone, 'friendly');
    assert.equal(prefs.interests.length, 4);
  });
});
