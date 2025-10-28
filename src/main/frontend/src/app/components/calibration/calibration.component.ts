import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, timer, of, switchMap, catchError } from 'rxjs';

import { CalibrationService, CalibrationStatusResponse } from '../../services/calibration.service';

@Component({
  selector: 'app-calibration',
  templateUrl: './calibration.component.html',
  styleUrls: ['./calibration.component.scss'],
})
export class CalibrationComponent implements OnInit, OnDestroy {
  status?: CalibrationStatusResponse;
  isStarting = false;
  lastError?: string;
  lastUpdated?: Date;
  etaSeconds?: number;

  private readonly pollIntervalMs = 2500;
  private pollSub?: Subscription;
  private etaIntervalId?: ReturnType<typeof setInterval>;
  private readonly defaultCountdownSeconds = 30;

  constructor(private readonly calibrationService: CalibrationService) {}

  ngOnInit(): void {
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.stopCountdown();
  }

  startCalibration(): void {
    if (this.isStarting || this.status?.running) {
      return;
    }

    this.isStarting = true;
    this.lastError = undefined;
    this.startCountdown();

    this.calibrationService.startCalibration().subscribe({
      next: status => {
        this.isStarting = false;
        if (status !== 'started' && status !== 'already_running') {
          this.lastError = `Unbekannte Antwort: ${status}`;
          this.stopCountdown();
          return;
        }
        this.status = { running: true, result: this.status?.result, offsets: this.status?.offsets };
        if (this.etaSeconds == null) {
          this.startCountdown();
        }
      },
      error: error => {
        this.isStarting = false;
        this.lastError = error?.message ?? 'Kalibrierung konnte nicht gestartet werden.';
        this.stopCountdown();
      },
    });
  }

  get running(): boolean {
    return !!this.status?.running;
  }

  hasOffsets(): boolean {
    return this.status?.offsets != null && Object.keys(this.status.offsets).length > 0;
  }

  isResultObject(): boolean {
    return !!this.status?.result && typeof this.status.result === 'object';
  }

  get countdownLabel(): string | null {
    if (!this.running && !this.isStarting) {
      return null;
    }
    if (this.etaSeconds == null) {
      return 'läuft';
    }
    return `${this.etaSeconds}s`;
  }

  private startPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = timer(0, this.pollIntervalMs)
      .pipe(
        switchMap(() =>
          this.calibrationService.getStatus().pipe(
            catchError(error => {
              this.lastError = error?.message ?? 'Kalibrierungsstatus konnte nicht geladen werden.';
              return of<CalibrationStatusResponse | undefined>(undefined);
            }),
          ),
        ),
      )
      .subscribe(status => {
        if (status) {
          this.status = status;
          this.lastUpdated = new Date();
          if (!status.running) {
            this.isStarting = false;
            this.stopCountdown();
          } else if (this.etaSeconds == null && !this.etaIntervalId) {
            this.startCountdown();
          }
        }
      });
  }

  private startCountdown(): void {
    this.stopCountdown(false);
    this.etaSeconds = this.defaultCountdownSeconds;
    this.etaIntervalId = setInterval(() => {
      if (this.etaSeconds == null) {
        return;
      }
      if (this.etaSeconds > 0) {
        this.etaSeconds -= 1;
      } else {
        if (this.etaIntervalId) {
          clearInterval(this.etaIntervalId);
          this.etaIntervalId = undefined;
        }
      }
    }, 1000);
  }

  private stopCountdown(resetSeconds = true): void {
    if (this.etaIntervalId) {
      clearInterval(this.etaIntervalId);
      this.etaIntervalId = undefined;
    }
    if (resetSeconds) {
      this.etaSeconds = undefined;
    }
  }
}





