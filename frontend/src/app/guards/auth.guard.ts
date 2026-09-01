import { Injectable, inject } from '@angular/core';
import type { CanActivate, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { Router } from '@angular/router';
import { map, of, take, type Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    // With the development bypass there is no session to redirect to, so protected routes open
    // directly. Sending the user to /login instead would strand them on a form the backend ignores.
    if (environment.authBypass) return of(true);

    return this.auth.isAuthenticated$.pipe(
      take(1),
      map((authenticated) => {
        if (!authenticated)
          void this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return authenticated;
      }),
    );
  }
}
