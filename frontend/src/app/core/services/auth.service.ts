import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, catchError, firstValueFrom, map, of, tap, type Observable } from 'rxjs';
import type {
  ApiResponse,
  AuthResponse,
  LoginRequest,
  SignupRequest,
  User,
} from '@voice-chat/shared';
import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';
import { SocketService } from './socket.service';

const TOKEN_KEY = 'voice_chat_token';
/** Owns the browser authentication session and coordinates socket lifecycle. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly sockets = inject(SocketService);
  private readonly current = new BehaviorSubject<User | null>(null);
  readonly currentUser$ = this.current.asObservable();
  readonly isAuthenticated$ = this.currentUser$.pipe(map((user) => user !== null));

  /**
   * Creates an account and activates its authenticated browser session.
   * @param request Email, password, and profile details for the new account.
   * @returns An observable that emits the authenticated user and bearer token.
   * @throws Emits API validation, conflict, or transport errors through the observable.
   */
  signup(request: SignupRequest): Observable<AuthResponse> {
    return this.api
      .post<AuthResponse, SignupRequest>('/auth/signup', request)
      .pipe(tap((response) => this.acceptAuth(response)));
  }

  /**
   * Authenticates credentials and activates the resulting browser session.
   * @param request Email and password to authenticate.
   * @returns An observable that emits the authenticated user and bearer token.
   * @throws Emits invalid-credential or transport errors through the observable.
   */
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.api
      .post<AuthResponse, LoginRequest>('/auth/login', request)
      .pipe(tap((response) => this.acceptAuth(response)));
  }

  /**
   * Creates a fresh guest session starting from scratch without registration.
   */
  loginAsGuest(): Observable<AuthResponse> {
    return this.api
      .post<AuthResponse, Record<string, never>>('/auth/guest', {})
      .pipe(tap((response) => this.acceptAuth(response)));
  }

  /**
   * Requests server-side logout and clears local authentication regardless of request failure.
   * @returns An observable that completes after local state and socket cleanup.
   */
  logout(): Observable<unknown> {
    return this.api.post<ApiResponse<null>>('/auth/logout', {}).pipe(
      catchError(() => of(null)),
      tap(() => this.clearSession()),
    );
  }

  /**
   * Fetches and publishes the profile associated with the current bearer token.
   * @returns An observable that emits the authenticated user profile.
   * @throws Emits unauthorized, missing-profile, or transport errors through the observable.
   */
  getMe(): Observable<User> {
    return this.api.get<ApiResponse<User>>('/auth/me').pipe(
      map((response) => response.data),
      tap((user) => this.current.next(user)),
    );
  }

  /**
   * Reads the persisted bearer token.
   * @returns The token, or `null` when no session is persisted.
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Persists a bearer token for subsequent API and socket authentication.
   * @param token Token issued by the authentication API.
   * @returns Nothing.
   */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /**
   * Removes the persisted bearer token.
   * @returns Nothing.
   */
  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  /**
   * Validates a persisted token before initial navigation and restores its socket connection.
   * Missing or invalid tokens are cleared so application bootstrap always completes logged out.
   * @returns A promise that resolves after restoration or cleanup has completed.
   */
  async checkAuthStatus(): Promise<void> {
    // The backend bypass ignores tokens, so the development user is adopted without one.
    const token = environment.authBypass ? undefined : (this.getToken() ?? undefined);
    if (!environment.authBypass && !token) {
      this.clearSession();
      return;
    }

    await firstValueFrom(
      this.getMe().pipe(
        tap(() => this.sockets.connect(token)),
        map(() => undefined),
        catchError(() => {
          this.clearSession();
          return of(undefined);
        }),
      ),
    );
  }

  /**
   * Clears persisted identity, publishes a logged-out state, and disconnects real-time transport.
   * @returns Nothing.
   */
  clearSession(): void {
    this.clearToken();
    this.current.next(null);
    this.sockets.disconnect();
  }

  private acceptAuth(response: AuthResponse): void {
    this.setToken(response.data.token);
    this.current.next(response.data.user);
    this.sockets.connect(response.data.token);
  }
}
