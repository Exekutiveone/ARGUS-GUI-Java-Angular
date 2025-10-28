import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

export type UpdateType = 'servo' | 'led';

@Injectable({
  providedIn: 'root',
})
export class DeviceUpdateService {
  private readonly baseUrl = this.resolveBaseUrl();
  private readonly fallbackBaseUrl = this.resolveFallbackBaseUrl();

  constructor(private readonly http: HttpClient) {}

  sendUpdate(channel: number, value: number, type: UpdateType): Observable<boolean> {
    const payload = { channel, value, type };
    return this.postUpdate(this.baseUrl, payload).pipe(
      catchError(error => {
        console.warn('[DeviceUpdateService] Failed to send update', error);
        if (!this.shouldRetryWithFallback(error)) {
          return of(false);
        }

        return this.postUpdate(this.fallbackBaseUrl!, payload).pipe(
          catchError(fallbackError => {
            console.warn('[DeviceUpdateService] Fallback host also failed', fallbackError);
            return of(false);
          }),
        );
      }),
    );
  }

  private resolveBaseUrl(): string {
    if (typeof window === 'undefined') {
      return 'http://192.168.178.164:5000';
    }

    const override = (window as { ARGUS_DEVICE_HOST?: string }).ARGUS_DEVICE_HOST;
    if (override) {
      return override.replace(/\/+$/, '');
    }

    const host = window.location.hostname || 'localhost';
    if (host === 'localhost' || host === '127.0.0.1') {
      return '/device-api';
    }

    return `${window.location.protocol}//${host}:5000`;
  }

  private resolveFallbackBaseUrl(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (this.baseUrl.startsWith('http')) {
      return null;
    }

    const fallback = 'http://192.168.178.164:5000';
    return fallback !== this.baseUrl ? fallback : null;
  }

  private shouldRetryWithFallback(error: unknown): boolean {
    return (
      !!this.fallbackBaseUrl &&
      this.fallbackBaseUrl !== this.baseUrl &&
      error instanceof HttpErrorResponse &&
      error.status === 404
    );
  }

  private postUpdate(
    url: string,
    payload: { channel: number; value: number; type: UpdateType },
  ): Observable<boolean> {
    return this.http.post<{ success?: boolean }>(`${url}/update`, payload).pipe(
      map(response => response?.success ?? true),
    );
  }
}
