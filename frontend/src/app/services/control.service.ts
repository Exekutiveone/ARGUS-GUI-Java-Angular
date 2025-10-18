import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, catchError, of, takeUntil } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

import {
  DriveMode,
  SteeringMode
} from '../models/telemetry.model';

interface ControlCommandPayload {
  source: 'keyboard' | 'gamepad' | 'ui';
  command: string;
  value?: number;
  timestamp: number;
}

interface CameraAdjustmentPayload {
  action: 'camera-pan-tilt';
  panDelta: number;
  tiltDelta: number;
  timestamp: number;
}

interface ControlState {
  throttle: number;
  brake: number;
  activeKeys: Set<string>;
  driveMode: DriveMode;
  steeringMode: SteeringMode;
}

@Injectable({
  providedIn: 'root'
})
export class ControlService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private controlSocket$?: WebSocketSubject<unknown>;

  private readonly controlState$ = new BehaviorSubject<ControlState>({
    throttle: 0,
    brake: 0,
    activeKeys: new Set<string>(),
    driveMode: 'NORMAL',
    steeringMode: '2WD'
  });

  readonly state$ = this.controlState$.asObservable();

  constructor(private readonly http: HttpClient) {
    this.initializeSocket();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.controlSocket$?.complete();
  }

  setKeyboardKeyState(key: string, isActive: boolean): void {
    const lowerKey = key.toLowerCase();
    const state = this.cloneState();
    if (isActive) {
      state.activeKeys.add(lowerKey);
    } else {
      state.activeKeys.delete(lowerKey);
    }
    this.controlState$.next(state);
    this.dispatchControlCommand({
      source: 'keyboard',
      command: lowerKey,
      timestamp: Date.now()
    });
  }

  setThrottle(throttle: number): void {
    const state = this.cloneState();
    state.throttle = throttle;
    this.controlState$.next(state);
    this.dispatchControlCommand({
      source: 'gamepad',
      command: 'throttle',
      value: throttle,
      timestamp: Date.now()
    });
  }

  setBrake(brake: number): void {
    const state = this.cloneState();
    state.brake = brake;
    this.controlState$.next(state);
    this.dispatchControlCommand({
      source: 'gamepad',
      command: 'brake',
      value: brake,
      timestamp: Date.now()
    });
  }

  updateDriveMode(mode: DriveMode): void {
    const state = this.cloneState();
    state.driveMode = mode;
    this.controlState$.next(state);

    this.http
      .post<void>('/api/mode', { mode })
      .pipe(
        catchError(() => of(void 0)),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  updateSteeringMode(mode: SteeringMode): void {
    const state = this.cloneState();
    state.steeringMode = mode;
    this.controlState$.next(state);

    this.http
      .post<void>('/api/steering', { mode })
      .pipe(
        catchError(() => of(void 0)),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  adjustCamera(panDelta: number, tiltDelta: number): void {
    const payload: CameraAdjustmentPayload = {
      action: 'camera-pan-tilt',
      panDelta,
      tiltDelta,
      timestamp: Date.now()
    };

    if (this.controlSocket$) {
      this.controlSocket$.next(payload);
    } else {
      this.http
        .post<void>('/api/control', payload)
        .pipe(catchError(() => of(void 0)))
        .subscribe();
    }
  }

  private dispatchControlCommand(payload: ControlCommandPayload): void {
    if (this.controlSocket$) {
      this.controlSocket$.next(payload);
      return;
    }

    this.http
      .post<void>('/api/control', payload)
      .pipe(catchError(() => of(void 0)))
      .subscribe();
  }

  private initializeSocket(): void {
    try {
      this.controlSocket$ = webSocket({
        url: `ws://${window.location.host}/ws/control`,
        serializer: (value) => JSON.stringify(value),
        deserializer: ({ data }) => JSON.parse(data)
      });

      this.controlSocket$
        .pipe(takeUntil(this.destroy$), catchError(() => of(void 0)))
        .subscribe();
    } catch {
      this.controlSocket$ = undefined;
    }
  }

  private cloneState(): ControlState {
    const state = this.controlState$.value;
    return {
      throttle: state.throttle,
      brake: state.brake,
      activeKeys: new Set(state.activeKeys),
      driveMode: state.driveMode,
      steeringMode: state.steeringMode
    };
  }
}
