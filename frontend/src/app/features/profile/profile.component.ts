import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgClass, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [AsyncPipe, DatePipe, NgClass, NgIf],
  template: ` <section class="card" *ngIf="auth.currentUser$ | async as user">
    <div class="profile-head">
      <h1>Your profile</h1>
      <span
        class="status"
        [ngClass]="socket.connectionState$ | async"
        title="Real-time server connection"
        >{{ statusLabel(socket.connectionState$ | async) }}</span
      >
    </div>
    <dl>
      <dt>Name</dt>
      <dd>{{ user.name }}</dd>
      <dt>Email</dt>
      <dd>{{ user.email }}</dd>
      <dt>Level</dt>
      <dd>{{ user.level }}</dd>
      <dt>Member since</dt>
      <dd>{{ user.created_at | date: 'mediumDate' }}</dd>
    </dl>
    <button (click)="logout()">Log out</button>
  </section>`,
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  readonly socket = inject(SocketService);
  private readonly router = inject(Router);
  statusLabel(state: string | null): string {
    return (
      (
        {
          connected: 'Connected',
          connecting: 'Connecting…',
          error: 'Connection Error',
          disconnected: 'Disconnected',
        } as Record<string, string>
      )[state ?? 'disconnected'] ?? 'Disconnected'
    );
  }
  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
