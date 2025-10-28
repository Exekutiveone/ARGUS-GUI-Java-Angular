import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { DeviceHostService } from './device-host.service';

export type UpdateType = 'servo' | 'led';

@Injectable({
  providedIn: 'root',
})
export class DeviceUpdateService {
  private baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    private readonly deviceHostService: DeviceHostService,
  ) {
    this.baseUrl = this.deviceHostService.currentBaseUrl;
    this.deviceHostService.baseUrl$.subscribe(url => {
      this.baseUrl = url;
    });
  }

  sendUpdate(channel: number, value: number, type: UpdateType): Observable<boolean> {
    const payload = { channel, value, type };
    const endpoint = this.composeUrl('/update');
    return this.postUpdate(endpoint, payload).pipe(
      catchError(error => {
        console.warn('[DeviceUpdateService] Failed to send update', error);
        return of(false);
      }),
    );
  }

  private composeUrl(path: string): string {
    const normalizedBase = this.baseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  private postUpdate(
    url: string,
    payload: { channel: number; value: number; type: UpdateType },
  ): Observable<boolean> {
    return this.http.post<{ success?: boolean }>(url, payload).pipe(
      map(response => response?.success ?? true),
    );
  }
}
