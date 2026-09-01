import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { of, firstValueFrom } from 'rxjs';
import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { AuthGuard } from '../src/app/guards/auth.guard.js';
import { AuthService } from '../src/app/core/services/auth.service.js';

describe('AuthGuard Tests', () => {
  it('should allow navigation when user is authenticated', async () => {
    const mockAuth = {
      isAuthenticated$: of(true),
    };
    const mockRouter = {
      navigate: () => Promise.resolve(true),
    };

    const injector = Injector.create({
      providers: [
        { provide: AuthGuard, useClass: AuthGuard },
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const guard = injector.get(AuthGuard);
    const result = await firstValueFrom(guard.canActivate({} as any, { url: '/partner' } as any));
    assert.equal(result, true);
  });

  it('should redirect to login when user is unauthenticated', async () => {
    let navigatedTo: string | null = null;
    const mockAuth = {
      isAuthenticated$: of(false),
    };
    const mockRouter = {
      navigate: (commands: string[], _extras: any) => {
        navigatedTo = commands[0];
        return Promise.resolve(true);
      },
    };

    const injector = Injector.create({
      providers: [
        { provide: AuthGuard, useClass: AuthGuard },
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    });

    const guard = injector.get(AuthGuard);
    const result = await firstValueFrom(guard.canActivate({} as any, { url: '/partner' } as any));
    assert.equal(result, false);
    assert.equal(navigatedTo, '/login');
  });
});
