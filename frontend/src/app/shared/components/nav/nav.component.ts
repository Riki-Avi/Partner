import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [AsyncPipe, NgIf, RouterLink, RouterLinkActive],
  template: ` <nav>
    <a class="brand" routerLink="/">Voice Chat</a>
    <div class="links">
      <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"
        >Home</a
      >
      <ng-container *ngIf="authBypass; else session">
        <a routerLink="/partner" routerLinkActive="active">Partner</a>
        <a routerLink="/adventure" routerLinkActive="active">Adventure ⚔️</a>
        <a routerLink="/chat" routerLinkActive="active">Chat</a>
        <a routerLink="/study" routerLinkActive="active">Study</a>
        <a routerLink="/phrases" routerLinkActive="active">Phrases</a>
        <a routerLink="/profile" routerLinkActive="active">Profile</a>
        <span
          class="dev-badge"
          title="AUTH_BYPASS is enabled in the backend environment, so login is disabled and every request is served as the development user."
          >dev mode</span
        >
      </ng-container>
      <ng-template #session>
        <ng-container *ngIf="auth.isAuthenticated$ | async; else guest">
          <a routerLink="/partner" routerLinkActive="active">Partner</a>
          <a routerLink="/adventure" routerLinkActive="active">Adventure ⚔️</a>
          <a routerLink="/chat" routerLinkActive="active">Chat</a>
          <a routerLink="/study" routerLinkActive="active">Study</a>
          <a routerLink="/phrases" routerLinkActive="active">Phrases</a>
          <a routerLink="/profile" routerLinkActive="active">Profile</a>
          <button class="link" (click)="logout()">Logout</button>
        </ng-container>
        <ng-template #guest>
          <a routerLink="/login" routerLinkActive="active">Login</a>
          <a routerLink="/signup" routerLinkActive="active">Signup</a>
        </ng-template>
      </ng-template>
    </div>
  </nav>`,
  styles: [
    `
      .dev-badge {
        border: 1px solid currentColor;
        border-radius: 999px;
        font-size: 0.75rem;
        letter-spacing: 0.04em;
        opacity: 0.75;
        padding: 0.1rem 0.5rem;
        text-transform: uppercase;
      }
    `,
  ],
})
export class NavComponent {
  readonly auth = inject(AuthService);
  /** Hides session controls that cannot work while the backend ignores authentication. */
  readonly authBypass = environment.authBypass;
  private readonly router = inject(Router);
  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
