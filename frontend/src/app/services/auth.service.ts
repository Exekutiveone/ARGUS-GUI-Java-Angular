import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';

import { AuthResponse, LoginRequest } from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly tokenKey = 'argus_token';
  private readonly authState$ = new BehaviorSubject<boolean>(
    this.hasStoredToken()
  );

  readonly isAuthenticated$ = this.authState$.asObservable();

  constructor(private readonly http: HttpClient) {}

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/login', credentials)
      .pipe(tap((response) => this.persistToken(response.token)));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this.authState$.next(false);
  }

  isAuthenticated(): boolean {
    return this.authState$.value;
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private persistToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
    this.authState$.next(true);
  }

  private hasStoredToken(): boolean {
    return !!localStorage.getItem(this.tokenKey);
  }
}
