import { HttpClient, HttpHeaders } from '@angular/common/http';
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

  /** Sends an HTTP POST request and returns a binary response body. */
  postBlob<B = unknown>(path: string, body: B): Observable<Blob> {
    return this.http.post(this.url(path), body, { responseType: 'blob' });
  }

  /**
   * Uploads a binary payload under an explicit content type.
   * @param path Path relative to the configured API base URL.
   * @param body Binary payload sent as the raw request body.
   * @param contentType Media type describing the payload, forwarded verbatim.
   * @returns An observable that emits the deserialized JSON response body.
   * @throws Emits the `HttpClient` request error through the returned observable.
   */
  postBinary<T>(path: string, body: Blob, contentType: string): Observable<T> {
    return this.http.post<T>(this.url(path), body, {
      headers: new HttpHeaders({ 'Content-Type': contentType }),
    });
  }

  /** Sends an HTTP PATCH request to an API path. */
  patch<T, B = unknown>(path: string, body: B): Observable<T> {
    return this.http.patch<T>(this.url(path), body);
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
