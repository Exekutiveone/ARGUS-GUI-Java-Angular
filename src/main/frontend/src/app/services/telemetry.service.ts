import { Injectable } from '@angular/core';
import { BehaviorSubject, Subscription, interval } from 'rxjs';

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

  private mockSubscription?: Subscription;
  private mockIndex = 0;
  private manualYawState?: { value: number; expiresAt: number };
  private readonly manualYawHoldMs = 600;

  connect(): void {
    if (this.mockSubscription) {
      return;
    }

    this.mockSubscription = interval(1500).subscribe(() => {
      const snapshot = this.generateMockUpdate(this.telemetrySubject.value);
      this.telemetrySubject.next(snapshot);
      this.mockIndex++;
    });
  }

  disconnect(): void {
    this.mockSubscription?.unsubscribe();
    this.mockSubscription = undefined;
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
    const now = Date.now();
    this.manualYawState = { value: yaw, expiresAt: now + this.manualYawHoldMs };

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
    this.manualYawState = undefined;
  }

  private createInitialSnapshot(): TelemetrySnapshot {
    return {
      timestamp: new Date().toISOString(),
      position: { lat: 48.1351, lon: 11.582 },
      heading: 0,
      orientation: { roll: 0, pitch: 0, yaw: 0 },
      temperatures: [
        { label: 'Temp #1', value: 32.5 },
        { label: 'Temp #3', value: 36.1 },
      ],
      acceleration: this.generateSeries(20, value => value * 2),
      braking: this.generateSeries(20, value => Math.max(0, Math.sin(value * 0.4)) * 30),
      speed: 18,
      battery: 86,
    };
  }

  private generateMockUpdate(previous: TelemetrySnapshot): TelemetrySnapshot {
    const heading = (previous.heading + 5 + Math.random() * 4) % 360;
    const orientation: Orientation = {
      roll: this.clamp(previous.orientation.roll + (Math.random() * 4 - 2), -10, 10),
      pitch: this.clamp(previous.orientation.pitch + (Math.random() * 3 - 1.5), -8, 8),
      yaw: (previous.orientation.yaw + (Math.random() * 6 - 3)) % 360,
    };

    const manualYaw = this.manualYawState;
    if (manualYaw && manualYaw.expiresAt > Date.now()) {
      orientation.yaw = manualYaw.value;
    } else {
      this.manualYawState = undefined;
    }

    const displacement = this.mockIndex * 0.0001;
    const position = {
      lat: previous.position.lat + displacement * 0.3,
      lon: previous.position.lon + displacement * 0.25,
    };

    const speed = this.clamp(previous.speed + (Math.random() * 4 - 2), 0, 42);
    const battery = this.clamp(previous.battery - 0.05, 20, 100);

    const accelValue = this.clamp(Math.max(0, speed * 1.4) + Math.random() * 5, 0, 100);
    const brakeValue = this.clamp(Math.max(0, (40 - speed) * 1.1 + Math.random() * 3), 0, 100);
    const acceleration = this.shiftAndAppend(previous.acceleration, accelValue);
    const braking = this.shiftAndAppend(previous.braking, brakeValue);

    const temperatures = previous.temperatures.map(reading => ({
      ...reading,
      value: this.clamp(reading.value + (Math.random() * 1.2 - 0.6), 20, 72),
    }));

    return {
      timestamp: new Date().toISOString(),
      position,
      heading,
      orientation,
      temperatures,
      acceleration,
      braking,
      speed,
      battery,
    };
  }

  private generateSeries(length: number, generator: (value: number) => number): number[] {
    return Array.from({ length }, (_, index) => generator(index));
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
}
