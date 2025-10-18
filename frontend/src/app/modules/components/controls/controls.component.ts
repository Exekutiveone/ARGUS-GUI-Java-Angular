import {
  Component,
  HostListener,
  OnDestroy,
  OnInit
} from '@angular/core';
import { Subscription } from 'rxjs';

import {
  DriveMode,
  SteeringMode
} from '../../../models/telemetry.model';
import { ControlService } from '../../../services/control.service';

@Component({
  selector: 'app-controls',
  templateUrl: './controls.component.html',
  styleUrls: ['./controls.component.scss']
})
export class ControlsComponent implements OnInit, OnDestroy {
  protected readonly driveModes: DriveMode[] = ['ECO', 'NORMAL', 'BOOST'];
  protected readonly steeringModes: SteeringMode[] = ['2WD', '4WD'];

  protected activeKeys = new Set<string>();
  protected throttle = 0;
  protected brake = 0;
  protected driveMode: DriveMode = 'NORMAL';
  protected steeringMode: SteeringMode = '2WD';

  private stateSubscription?: Subscription;
  private gamepadFrameId?: number;
  private connectedGamepadIndex?: number;

  constructor(private readonly controlService: ControlService) {}

  ngOnInit(): void {
    this.stateSubscription = this.controlService.state$.subscribe((state) => {
      this.activeKeys = new Set(state.activeKeys);
      this.throttle = state.throttle;
      this.brake = state.brake;
      this.driveMode = state.driveMode;
      this.steeringMode = state.steeringMode;
    });

    window.addEventListener(
      'gamepadconnected',
      this.handleGamepadConnected,
      false
    );
    window.addEventListener(
      'gamepaddisconnected',
      this.handleGamepadDisconnected,
      false
    );
  }

  ngOnDestroy(): void {
    this.stateSubscription?.unsubscribe();
    window.removeEventListener(
      'gamepadconnected',
      this.handleGamepadConnected,
      false
    );
    window.removeEventListener(
      'gamepaddisconnected',
      this.handleGamepadDisconnected,
      false
    );
    if (this.gamepadFrameId) {
      cancelAnimationFrame(this.gamepadFrameId);
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat || this.isTyping(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd'].includes(key)) {
      return;
    }

    event.preventDefault();
    this.controlService.setKeyboardKeyState(key, true);
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    if (this.isTyping(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd'].includes(key)) {
      return;
    }

    event.preventDefault();
    this.controlService.setKeyboardKeyState(key, false);
  }

  selectDriveMode(mode: DriveMode): void {
    if (this.driveMode === mode) {
      return;
    }
    this.controlService.updateDriveMode(mode);
  }

  selectSteeringMode(mode: SteeringMode): void {
    if (this.steeringMode === mode) {
      return;
    }
    this.controlService.updateSteeringMode(mode);
  }

  protected getFillStyle(value: number): Record<string, string> {
    return {
      height: `${Math.min(value * 100, 100)}%`
    };
  }

  private isTyping(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target as HTMLElement | null)?.isContentEditable === true
    );
  }

  private handleGamepadConnected = (event: GamepadEvent): void => {
    this.connectedGamepadIndex = event.gamepad.index;
    this.startGamepadLoop();
  };

  private handleGamepadDisconnected = (event: GamepadEvent): void => {
    if (this.connectedGamepadIndex === event.gamepad.index) {
      this.connectedGamepadIndex = undefined;
      if (this.gamepadFrameId) {
        cancelAnimationFrame(this.gamepadFrameId);
      }
      this.controlService.setThrottle(0);
      this.controlService.setBrake(0);
    }
  };

  private startGamepadLoop(): void {
    const poll = () => {
      const gamepads = navigator.getGamepads();
      const gamepad =
        this.connectedGamepadIndex !== undefined
          ? gamepads[this.connectedGamepadIndex]
          : null;

      if (gamepad) {
        const throttle = this.normalizeTrigger(gamepad.buttons[7]?.value ?? 0);
        const brake = this.normalizeTrigger(gamepad.buttons[6]?.value ?? 0);
        this.controlService.setThrottle(throttle);
        this.controlService.setBrake(brake);
      }

      this.gamepadFrameId = requestAnimationFrame(poll);
    };

    this.gamepadFrameId = requestAnimationFrame(poll);
  }

  private normalizeTrigger(value: number): number {
    return Math.min(Math.max(value, 0), 1);
  }
}
