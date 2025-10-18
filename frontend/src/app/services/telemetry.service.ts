import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, OnDestroy } from '@angular/core';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  Subject,
  catchError,
  shareReplay,
  tap
} from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

import {
  Orientation,
  TelemetrySnapshot
} from '../models/telemetry.model';

@Injectable({
  providedIn: 'root'
})
export class TelemetryService implements OnDestroy {
  private readonly telemetrySubject = new BehaviorSubject<TelemetrySnapshot>(
    this.createInitialTelemetry()
  );
  private readonly destroy$ = new Subject<void>();
  private telemetrySocket$?: WebSocketSubject<TelemetrySnapshot>;
  private mockIntervalId?: number;

  readonly telemetry$: Observable<TelemetrySnapshot> =
    this.telemetrySubject
      .asObservable()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

  constructor(
    private readonly http: HttpClient,
    private readonly ngZone: NgZone
  ) {
    this.bootstrapTelemetryStream();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.telemetrySocket$?.complete();
    if (this.mockIntervalId) {
      window.clearInterval(this.mockIntervalId);
    }
  }

  refreshSnapshot(): Observable<TelemetrySnapshot> {
    return this.http.get<TelemetrySnapshot>('/api/telemetry').pipe(
      tap((snapshot) => this.telemetrySubject.next(snapshot)),
      catchError(() => EMPTY)
    );
  }

  private bootstrapTelemetryStream(): void {
    this.refreshSnapshot().subscribe();
    this.connectToSocket();
  }

  private connectToSocket(): void {
    try {
      this.telemetrySocket$ = webSocket<TelemetrySnapshot>({
        url: `ws://${window.location.host}/ws/telemetry`,
        deserializer: ({ data }) => JSON.parse(data)
      });

      this.telemetrySocket$
        .pipe(
          tap((snapshot) => this.telemetrySubject.next(snapshot)),
          catchError((error) => {
            console.warn('Telemetry socket error, using mock data', error);
            this.startMockTelemetry();
            return EMPTY;
          })
        )
        .subscribe();
    } catch (error) {
      console.warn('Telemetry socket unavailable, using mock data', error);
      this.startMockTelemetry();
    }
  }

  private startMockTelemetry(): void {
    if (this.mockIntervalId) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.mockIntervalId = window.setInterval(() => {
        const current = this.telemetrySubject.value;
        const orientation = this.rollOrientation(current.orientation);
        const throttle = Math.abs(Math.sin(Date.now() / 1500));
        const brake = Math.abs(Math.cos(Date.now() / 1800)) * 0.4;

        const updated: TelemetrySnapshot = {
          ...current,
          gps: {
            lat: current.gps.lat + this.randomVariance(0.0001),
            lng: current.gps.lng + this.randomVariance(0.0001)
          },
          heading: (current.heading + 2) % 360,
          orientation,
          throttle,
          brake,
          accelerationHistory: this.shiftSeries(
            current.accelerationHistory,
            throttle * 9
          ),
          brakingHistory: this.shiftSeries(
            current.brakingHistory,
            brake * 7
          ),
          temps: current.temps.map((temp) => ({
            ...temp,
            value: temp.value + this.randomVariance(0.3)
          })),
          timestamp: Date.now()
        };

        this.ngZone.run(() => this.telemetrySubject.next(updated));
      }, 1000);
    });
  }

  private shiftSeries(series: number[], nextValue: number): number[] {
    const copy = [...series, parseFloat(nextValue.toFixed(2))];
    if (copy.length > 20) {
      copy.shift();
    }
    return copy;
  }

  private rollOrientation(orientation: Orientation): Orientation {
    return {
      roll: (orientation.roll + 1.5) % 360,
      pitch: (orientation.pitch + 1.2) % 360,
      yaw: (orientation.yaw + 2) % 360
    };
  }

  private randomVariance(scale: number): number {
    return (Math.random() - 0.5) * scale * 2;
  }

  private createInitialTelemetry(): TelemetrySnapshot {
    return {
      gps: { lat: 52.52, lng: 13.405 },
      heading: 0,
      orientation: { roll: 0, pitch: 0, yaw: 0 },
      throttle: 0,
      brake: 0,
      temps: [
        { label: 'Temp #1', value: 32.5 },
        { label: 'Temp #3', value: 34.2 }
      ],
      accelerationHistory: Array(20).fill(0),
      brakingHistory: Array(20).fill(0),
      timestamp: Date.now()
    };
  }
}
