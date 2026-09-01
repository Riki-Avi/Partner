import '@angular/compiler';
import { Observable, of, throwError } from 'rxjs';
import type { ApiResponse, User } from '@voice-chat/shared';

export class MockLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export class MockApiService {
  private responses = new Map<string, unknown>();
  private errors = new Map<string, unknown>();

  setResponse(path: string, response: unknown): void {
    this.responses.set(path, response);
  }

  setError(path: string, error: unknown): void {
    this.errors.set(path, error);
  }

  get<T>(path: string): Observable<T> {
    if (this.errors.has(path)) {
      return throwError(() => this.errors.get(path));
    }
    return of((this.responses.get(path) ?? { success: true, data: null }) as T);
  }

  post<T, B = unknown>(path: string, _body: B): Observable<T> {
    if (this.errors.has(path)) {
      return throwError(() => this.errors.get(path));
    }
    return of((this.responses.get(path) ?? { success: true, data: null }) as T);
  }

  put<T, B = unknown>(path: string, _body: B): Observable<T> {
    if (this.errors.has(path)) {
      return throwError(() => this.errors.get(path));
    }
    return of((this.responses.get(path) ?? { success: true, data: null }) as T);
  }

  patch<T, B = unknown>(path: string, _body: B): Observable<T> {
    if (this.errors.has(path)) {
      return throwError(() => this.errors.get(path));
    }
    return of((this.responses.get(path) ?? { success: true, data: null }) as T);
  }

  delete<T>(path: string): Observable<T> {
    if (this.errors.has(path)) {
      return throwError(() => this.errors.get(path));
    }
    return of((this.responses.get(path) ?? { success: true, data: null }) as T);
  }
}

export class MockSocketService {
  connected = false;
  connect(_token: string): void {
    this.connected = true;
  }
  disconnect(): void {
    this.connected = false;
  }
}
