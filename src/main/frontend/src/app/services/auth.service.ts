import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, delay, of, tap, throwError } from 'rxjs';

interface Credentials {
  username: string;
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly storageKey = 'argus-auth-token';
  private readonly validCredentials: Credentials = { username: 'admin', password: '1234' };
  private readonly authState$ = new BehaviorSubject<boolean>(this.hasStoredToken());

  readonly isAuthenticated$ = this.authState$.asObservable();

  constructor(private readonly router: Router) {}

  login(username: string, password: string): Observable<void> {
    const matches =
      username.trim().toLowerCase() === this.validCredentials.username &&
      password === this.validCredentials.password;

    if (!matches) {
      return throwError(() => new Error('Ungültige Zugangsdaten.'));
    }

    return of(undefined).pipe(
      delay(400),
      tap(() => {
        localStorage.setItem(this.storageKey, JSON.stringify({ username, timestamp: Date.now() }));
        this.authState$.next(true);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
    this.authState$.next(false);
    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    return this.authState$.value;
  }

  private hasStoredToken(): boolean {
    const tokenRaw = localStorage.getItem(this.storageKey);
    if (!tokenRaw) {
      return false;
    }

    try {
      const { timestamp } = JSON.parse(tokenRaw);
      const maxAge = 1000 * 60 * 60 * 12; // 12h
      return Date.now() - timestamp < maxAge;
    } catch {
      localStorage.removeItem(this.storageKey);
      return false;
    }
  }
}
