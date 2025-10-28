import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, of, Subscription, timer, switchMap } from 'rxjs';

import { Orientation } from '../components/car-model/car-model.component';
import { TemperatureReading } from '../components/sensors/sensors.component';

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
  private readonly deviceApiBase = this.resolveDeviceBaseUrl();

  constructor(private readonly http: HttpClient) {}

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

  applyManualYaw(yawDegrees: number): void {
    const yaw = this.normalizeAngle(yawDegrees);
    const current = this.telemetrySubject.value;
    if (current.orientation.yaw === yaw) {
      return;
    }

    const snapshot: TelemetrySnapshot = {
      ...current,
      timestamp: new Date().toISOString(),
      orientation: {
        ...current.orientation,
        yaw,
      },
    };

    this.telemetrySubject.next(snapshot);
  }

  clearManualYaw(): void {
    // No-op; kept for compatibility with previous mock implementation.
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
        const heading = typeof data.mag?.heading_deg === 'number' ? data.mag.heading_deg : current.heading;
        let yaw = this.normalizeAngle(heading);
        if (data.mag?.heading_deg == null && data.gyro) {
          yaw = this.normalizeAngle(data.gyro.z);
        }

        let roll = current.orientation.roll;
        let pitch = current.orientation.pitch;
        if (data.gyro) {
          roll = data.gyro.x;
          pitch = data.gyro.y;
        } else if (data.accel) {
          const ax = data.accel.x;
          const ay = data.accel.y;
          const az = data.accel.z;
          const rollRad = Math.atan2(ay, az);
          const pitchRad = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
          roll = this.toDegrees(rollRad);
          pitch = this.toDegrees(pitchRad);
        }
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
          orientation: {
            roll,
            pitch,
            yaw,
          },
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









