import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value
    ? null
    : { mismatch: true };
}
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: ` <section class="card">
    <h1>Create account</h1>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Name<input formControlName="name" autocomplete="name" /></label
      ><label>Email<input type="email" formControlName="email" autocomplete="email" /></label>
      <label
        >Password<input
          type="password"
          formControlName="password"
          autocomplete="new-password" /></label
      ><label
        >Confirm password<input
          type="password"
          formControlName="confirmPassword"
          autocomplete="new-password"
      /></label>
      <p class="error" *ngIf="form.hasError('mismatch') && form.controls.confirmPassword.touched">
        Passwords must match.
      </p>
      <p class="error" *ngIf="error">{{ error }}</p>
      <button [disabled]="form.invalid || loading">{{ loading ? 'Creating…' : 'Sign up' }}</button>
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
    <p style="margin-top: 1.5rem">Already registered? <a routerLink="/login">Log in</a></p>
  </section>`,
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly form = this.fb.nonNullable.group(
    {
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );
  loading = false;
  guestLoading = false;
  error = '';

  submit(): void {
    if (this.form.invalid) return;
    const { name, email, password } = this.form.getRawValue();
    this.loading = true;
    this.error = '';
    this.auth
      .signup({ name, email, password })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => void this.router.navigate(['/partner']),
        error: (e: { error?: { error?: { message?: string } } }) =>
          (this.error = e.error?.error?.message ?? 'Signup failed'),
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
