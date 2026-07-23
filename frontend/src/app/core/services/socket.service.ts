import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ConnectionState, ServerEvents } from '@voice-chat/shared';
import { environment } from '../../../environments/environment';

/** Manages authenticated real-time connectivity and exposes events as RxJS streams. */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket<ServerEvents, ClientEvents> | null = null;
  private readonly state = new BehaviorSubject<ConnectionState>('disconnected');
  readonly connectionState$ = this.state.asObservable();

  /**
   * Replaces any existing socket with an authenticated connection using bounded retries.
   * @param token Bearer token sent in the Socket.IO authentication handshake.
   * @returns Nothing; connection state is published through `connectionState$`.
   */
  connect(token: string): void {
    this.disconnect();
    this.state.next('connecting');
    this.socket = io(environment.socketUrl, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      randomizationFactor: 0.5,
    });
    this.socket.on('connect', () => this.state.next('connected'));
    this.socket.on('authenticated', ({ userId }) =>
      console.info(`Socket authenticated for ${userId}`),
    );
    this.socket.on('disconnect', () => this.state.next('disconnected'));
    this.socket.on('connect_error', (error) => {
      this.state.next('error');
      console.error('Socket connection error:', error.message);
    });
    this.socket.connect();
  }

  /**
   * Removes listeners, closes the active socket, and publishes a disconnected state.
   * @returns Nothing.
   */
  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.state.next('disconnected');
  }

  /**
   * Sends a typed client event when the socket is currently connected.
   * @param event Client event name defined by the shared Socket.IO contract.
   * @param args Payload arguments required by that event.
   * @returns `true` when emitted, or `false` when no connected socket is available.
   */
  emit<E extends keyof ClientEvents>(event: E, ...args: Parameters<ClientEvents[E]>): boolean {
    if (!this.socket?.connected) return false;
    this.socket.emit(event, ...args);
    return true;
  }

  /**
   * Observes a server event and unregisters its listener when the subscription ends.
   * @param event Server event name defined by the shared Socket.IO contract.
   * @returns An observable that emits each payload received for the event.
   */
  on<T>(event: keyof ServerEvents): Observable<T> {
    return new Observable<T>((subscriber) => {
      const handler = (value: T): void => subscriber.next(value);
      this.socket?.on(event, handler as never);
      return () => this.socket?.off(event, handler as never);
    });
  }
}
