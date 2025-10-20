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
}
