import { Injectable, inject } from '@angular/core';
import type { CanActivate, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { Router } from '@angular/router';
import { map, take, type Observable } from 'rxjs';
import { AuthService } from '../core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
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
