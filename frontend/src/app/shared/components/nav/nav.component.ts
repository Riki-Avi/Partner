import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
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
      <ng-container *ngIf="auth.isAuthenticated$ | async; else guest"
        ><a routerLink="/chat" routerLinkActive="active">Chat</a
        ><a routerLink="/profile" routerLinkActive="active">Profile</a
        ><button class="link" (click)="logout()">Logout</button></ng-container
      >
      <ng-template #guest
        ><a routerLink="/login" routerLinkActive="active">Login</a
        ><a routerLink="/signup" routerLinkActive="active">Signup</a></ng-template
      >
    </div>
  </nav>`,
})
export class NavComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
