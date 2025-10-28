import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { DeviceHostService } from './device-host.service';

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
  private deviceApiBase: string;

  constructor(
    private readonly http: HttpClient,
    private readonly deviceHostService: DeviceHostService,
  ) {
    this.deviceApiBase = this.deviceHostService.currentBaseUrl;
    this.deviceHostService.baseUrl$.subscribe(url => {
      this.deviceApiBase = url;
    });
  }

  startCalibration(): Observable<CalibrationStartResponse> {
    return this.http
      .post<{ status: string }>(`${this.deviceApiBase}/calibrate`, {})
      .pipe(map(response => response.status));
  }

  getStatus(): Observable<CalibrationStatusResponse> {
    return this.http.get<CalibrationStatusResponse>(`${this.deviceApiBase}/calibration_result`);
  }
}
