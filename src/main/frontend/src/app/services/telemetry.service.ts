import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, of, Subscription, timer, switchMap } from 'rxjs';

import { Orientation } from '../components/car-model/car-model.component';
import { TemperatureReading } from '../components/sensors/sensors.component';
import { DeviceHostService } from './device-host.service';

export interface TelemetrySnapshot {
  timestamp: string;
  position: { lat: number; lon: number };
  heading: number;
  orientation: Orientation;
  temperatures: TemperatureReading[];
  acceleration: number[];
  braking: number[];
  speed: number;
  battery: number;
}



@Injectable({
  providedIn: 'root',
})
export class TelemetryService {
  private readonly telemetrySubject = new BehaviorSubject<TelemetrySnapshot>(this.createInitialSnapshot());
  readonly telemetry$ = this.telemetrySubject.asObservable();

  private isConnected = false;
  private sensorPollSub?: Subscription;
  private readonly sensorPollIntervalMs = 1000;
  private deviceApiBase: string;
  private orientationState: Orientation = { roll: 0, pitch: 0, yaw: 0 };
  private orientationInitialized = false;

  constructor(
    private readonly http: HttpClient,
    private readonly deviceHostService: DeviceHostService,
  ) {
    this.deviceApiBase = this.deviceHostService.currentBaseUrl;
    this.deviceHostService.baseUrl$.subscribe(url => {
      this.deviceApiBase = url;
      if (this.isConnected) {
        this.startSensorPolling();
      }
    });
  }

  connect(): void {
    if (this.isConnected) {
      return;
    }

    this.isConnected = true;
    this.startSensorPolling();
  }

  disconnect(): void {
    this.isConnected = false;
    this.sensorPollSub?.unsubscribe();
    this.sensorPollSub = undefined;
  }

  applyManualInput(throttlePercent: number, brakePercent: number): void {
    const current = this.telemetrySubject.value;
    const throttle = this.clamp(throttlePercent, 0, 100);
    const brake = this.clamp(brakePercent, 0, 100);

    const acceleration = this.shiftAndAppend(current.acceleration, throttle);
    const braking = this.shiftAndAppend(current.braking, brake);
    const speed = this.clamp(current.speed + throttle * 0.05 - brake * 0.06, 0, 60);

    const snapshot: TelemetrySnapshot = {
      ...current,
      timestamp: new Date().toISOString(),
      acceleration,
      braking,
      speed,
    };

    this.telemetrySubject.next(snapshot);
  }

  resetOrientation(): void {
    this.orientationState = { roll: 0, pitch: 0, yaw: 0 };
    this.orientationInitialized = false;
    const current = this.telemetrySubject.value;
    const snapshot: TelemetrySnapshot = {
      ...current,
      timestamp: new Date().toISOString(),
      heading: 0,
      orientation: { roll: 0, pitch: 0, yaw: 0 },
    };
    this.telemetrySubject.next(snapshot);
  }

  private createInitialSnapshot(): TelemetrySnapshot {
    return {
      timestamp: new Date().toISOString(),
      position: { lat: 0, lon: 0 },
      heading: 0,
      orientation: { roll: 0, pitch: 0, yaw: 0 },
      temperatures: [
        { label: 'BME Temp', value: 0 },
        { label: 'Thermal Max', value: 0 },
      ],
      acceleration: Array(20).fill(0),
      braking: Array(20).fill(0),
      speed: 0,
      battery: 0,
    };
  }

  private startSensorPolling(): void {
    this.sensorPollSub?.unsubscribe();
    this.sensorPollSub = timer(0, this.sensorPollIntervalMs)
      .pipe(
        switchMap(() =>
          this.http
            .get<SensorData>(`${this.deviceApiBase}/sensor_data`)
            .pipe(catchError(() => of(undefined))),
        ),
      )
      .subscribe(data => {
        if (!data) {
          return;
        }

        const current = this.telemetrySubject.value;

        if (data.accel) {
          const accelAngles = this.computeAccelAngles(data.accel);
          const alpha = this.orientationInitialized ? 0.18 : 1;
          this.orientationState.roll = this.blendSignedAngle(this.orientationState.roll, accelAngles.roll, alpha);
          this.orientationState.pitch = this.blendSignedAngle(this.orientationState.pitch, accelAngles.pitch, alpha);
          this.orientationInitialized = true;
        }

        const headingSource =
          typeof data.mag?.heading_deg === 'number'
            ? data.mag.heading_deg
            : typeof data.gyro?.z === 'number'
              ? data.gyro.z
              : undefined;

        if (headingSource != null) {
          const yawAlpha = this.orientationInitialized ? 0.12 : 1;
          this.orientationState.yaw = this.blendUnsignedAngle(this.orientationState.yaw, headingSource, yawAlpha);
        }

        const heading = this.normalizeAngle(this.orientationState.yaw);
        const orientation: Orientation = {
          roll: this.wrapSignedAngle(this.orientationState.pitch),
          pitch: this.wrapSignedAngle(this.orientationState.roll),
          yaw: heading,
        };

        const accelMagnitude =
          data.accel != null
            ? Math.sqrt(data.accel.x ** 2 + data.accel.y ** 2 + data.accel.z ** 2) / 16384
            : current.acceleration[current.acceleration.length - 1] ?? 0;

        const temperatures: TemperatureReading[] = [
          { label: 'BME Temp', value: data.bme?.temp_c ?? current.temperatures[0]?.value ?? 0 },
          { label: 'Thermal Max', value: data.thermal?.tmax ?? current.temperatures[1]?.value ?? 0 },
        ];

        const snapshot: TelemetrySnapshot = {
          ...current,
          timestamp: new Date().toISOString(),
          heading,
          orientation,
          acceleration: this.shiftAndAppend(current.acceleration, accelMagnitude),
          temperatures,
        };

        this.telemetrySubject.next(snapshot);
      });
  }

  private shiftAndAppend(series: number[], value: number): number[] {
    const copy = [...series];
    if (copy.length > 0) {
      copy.shift();
    }
    copy.push(value);
    return copy;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private computeAccelAngles(accel: { x: number; y: number; z: number }): { roll: number; pitch: number } {
    const { x, y, z } = accel;
    const rollRad = Math.atan2(y, z || 1);
    const pitchRad = Math.atan2(-x, Math.sqrt(y * y + z * z));
    return {
      roll: this.toDegrees(rollRad),
      pitch: this.toDegrees(pitchRad),
    };
  }

  private wrapSignedAngle(angle: number): number {
    let wrapped = (angle + 180) % 360;
    if (wrapped < 0) {
      wrapped += 360;
    }
    return wrapped - 180;
  }

  private blendSignedAngle(current: number, target: number, alpha: number): number {
    const currentWrapped = this.wrapSignedAngle(current);
    const targetWrapped = this.wrapSignedAngle(target);
    let diff = targetWrapped - currentWrapped;
    if (diff > 180) {
      diff -= 360;
    } else if (diff < -180) {
      diff += 360;
    }
    return this.wrapSignedAngle(currentWrapped + diff * alpha);
  }

  private blendUnsignedAngle(current: number, target: number, alpha: number): number {
    const currentNorm = this.normalizeAngle(current);
    const targetNorm = this.normalizeAngle(target);
    let diff = targetNorm - currentNorm;
    if (diff > 180) {
      diff -= 360;
    } else if (diff < -180) {
      diff += 360;
    }
    return this.normalizeAngle(currentNorm + diff * alpha);
  }

  private normalizeAngle(angle: number): number {
    let normalized = angle % 360;
    if (normalized < 0) {
      normalized += 360;
    }
    return normalized;
  }

  private toDegrees(rad: number): number {
    return (rad * 180) / Math.PI;
  }

}

interface SensorData {
  accel?: { x: number; y: number; z: number };
  gyro?: { x: number; y: number; z: number };
  mag?: { heading_deg?: number; x: number; y: number; z: number };
  bme?: {
    humidity_pct?: number;
    pressure_hpa?: number;
    temp_c?: number;
  };
  thermal?: {
    tmax?: number;
    tmin?: number;
  };
}









