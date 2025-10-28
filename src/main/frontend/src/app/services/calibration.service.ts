import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface CalibrationStatusResponse {
  running: boolean;
  result: unknown;
  offsets?: Record<string, number>;
}

type CalibrationStartResponse = 'started' | 'already_running' | string;

@Injectable({
  providedIn: 'root',
})
export class CalibrationService {
  private readonly deviceApiBase = this.resolveDeviceBaseUrl();

  constructor(private readonly http: HttpClient) {}

  startCalibration(): Observable<CalibrationStartResponse> {
    return this.http
      .post<{ status: string }>(`${this.deviceApiBase}/calibrate`, {})
      .pipe(map(response => response.status));
  }

  getStatus(): Observable<CalibrationStatusResponse> {
    return this.http.get<CalibrationStatusResponse>(`${this.deviceApiBase}/calibration_result`);
  }

  private resolveDeviceBaseUrl(): string {
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
}
