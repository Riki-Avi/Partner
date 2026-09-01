import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: ` <section class="card">
    <h1>Welcome back</h1>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Email<input type="email" formControlName="email" autocomplete="email" /></label>
      <label
        >Password<input type="password" formControlName="password" autocomplete="current-password"
      /></label>
      <p class="error" *ngIf="error">{{ error }}</p>
      <button [disabled]="form.invalid || loading">{{ loading ? 'Signing in…' : 'Log in' }}</button>
    </form>
    <div class="guest-divider">
      <span>o</span>
    </div>
    <button
      type="button"
      class="guest-btn"
      [disabled]="loading || guestLoading"
      (click)="loginAsGuest()"
    >
      <span>👤</span>
      <span>{{
        guestLoading
          ? 'Preparando sesión de invitado…'
          : 'Iniciar sesión como invitado (Probar gratis)'
      }}</span>
    </button>
    <p style="margin-top: 1.5rem">New here? <a routerLink="/signup">Create an account</a></p>
  </section>`,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  loading = false;
  guestLoading = false;
  error = '';

  submit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    this.auth
      .login(this.form.getRawValue())
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => void this.router.navigate(['/partner']),
        error: (e: { error?: { error?: { message?: string } } }) =>
          (this.error = e.error?.error?.message ?? 'Login failed'),
      });
  }

  loginAsGuest(): void {
    this.guestLoading = true;
    this.error = '';
    this.auth
      .loginAsGuest()
      .pipe(finalize(() => (this.guestLoading = false)))
      .subscribe({
        next: () => void this.router.navigate(['/partner']),
        error: (e: { error?: { error?: { message?: string } } }) =>
          (this.error = e.error?.error?.message ?? 'Guest login failed. Please try again.'),
      });
  }
}
