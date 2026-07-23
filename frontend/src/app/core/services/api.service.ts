import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private url(path: string): string {
    return `${environment.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /**
   * Sends an HTTP GET request to an API path.
   * @param path Path relative to the configured API base URL.
   * @returns An observable that emits the deserialized response body.
   * @throws Emits the `HttpClient` request error through the returned observable.
   */
  get<T>(path: string): Observable<T> {
    return this.http.get<T>(this.url(path));
  }

  /**
   * Sends an HTTP POST request to an API path.
   * @param path Path relative to the configured API base URL.
   * @param body Request payload to serialize.
   * @returns An observable that emits the deserialized response body.
   * @throws Emits the `HttpClient` request error through the returned observable.
   */
  post<T, B = unknown>(path: string, body: B): Observable<T> {
    return this.http.post<T>(this.url(path), body);
  }

  /**
   * Sends an HTTP PUT request to an API path.
   * @param path Path relative to the configured API base URL.
   * @param body Request payload to serialize.
   * @returns An observable that emits the deserialized response body.
   * @throws Emits the `HttpClient` request error through the returned observable.
   */
  put<T, B = unknown>(path: string, body: B): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  /**
   * Sends an HTTP DELETE request to an API path.
   * @param path Path relative to the configured API base URL.
   * @returns An observable that emits the deserialized response body.
   * @throws Emits the `HttpClient` request error through the returned observable.
   */
  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }
}
