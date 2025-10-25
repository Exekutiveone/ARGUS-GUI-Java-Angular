import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-controls',
  templateUrl: './controls.component.html',
  styleUrls: ['./controls.component.scss'],
})
export class ControlsComponent {
  @Input() pressedKeys: string[] = [];
  @Input() throttleLevel = 0;
  @Input() brakeLevel = 0;
  @Input() controllerConnected = false;
  @Input() leftStick: { x: number; y: number } = { x: 0, y: 0 };
  @Input() rightStick: { x: number; y: number } = { x: 0, y: 0 };
  @Input() ledIntensity = 0;
  @Input() ledFrontActive = false;
  @Input() ledSweepActive = false;
  @Input() laserFrontActive = false;
  @Input() laserSweepActive = false;

  @Input() driveModes: string[] = [];
  @Input() steeringModes: string[] = [];
  @Input() driveMode?: string;
  @Input() steeringMode?: string;

  @Output() driveModeChange = new EventEmitter<string>();
  @Output() steeringModeChange = new EventEmitter<string>();

  isActive(key: string): boolean {
    return this.pressedKeys.includes(key.toLowerCase());
  }

  selectDriveMode(mode: string): void {
    if (mode !== this.driveMode) {
      this.driveModeChange.emit(mode);
    }
  }

  selectSteeringMode(mode: string): void {
    if (mode !== this.steeringMode) {
      this.steeringModeChange.emit(mode);
    }
  }

  stickStyle(stick: { x: number; y: number }): Record<string, string> {
    const radius = 48;
    const x = this.clamp(stick.x, -1, 1) * radius;
    const y = this.clamp(stick.y, -1, 1) * radius;
    return {
      transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
    };
  }

  indicatorClass(active: boolean): string {
    return active ? 'indicator on' : 'indicator';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
