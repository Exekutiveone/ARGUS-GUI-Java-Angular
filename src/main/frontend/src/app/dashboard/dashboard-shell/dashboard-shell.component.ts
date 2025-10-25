import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { ControlService, DriveCommand } from '../../services/control.service';
import { TelemetryService, TelemetrySnapshot } from '../../services/telemetry.service';
import { VideoService } from '../../services/video.service';
import { CameraFeed } from '../../components/camera/camera.component';
import { Orientation } from '../../components/car-model/car-model.component';
import { TaskItem } from '../../components/tasks/tasks.component';

@Component({
  selector: 'app-dashboard-shell',
  templateUrl: './dashboard-shell.component.html',
  styleUrls: ['./dashboard-shell.component.scss'],
})
export class DashboardShellComponent implements OnInit, OnDestroy {
  readonly driveModes = ['Eco', 'Normal', 'Boost'];
  readonly steeringModes = ['2WD', '4WD'];
  readonly tasks: TaskItem[] = [
    { id: 'nav', title: 'Streckenplanung aktualisieren', description: 'Prüfe Waypoints und aktualisiere die Route.', status: 'running' },
    { id: 'systems', title: 'Systemdiagnose', description: 'Sensoren kalibrieren und Selbsttest abschließen.', status: 'pending' },
    { id: 'delivery', title: 'Nächster Lieferpunkt', description: 'ETA 8 Minuten, Paket #42-FF bereitstellen.', status: 'pending' },
  ];
  readonly displayProfiles = ['overview', 'navigation', 'diagnostics'];

  driveMode = this.driveModes[1];
  steeringMode = this.steeringModes[1];
  activeDisplayProfile = this.displayProfiles[0];
  ledIntensity = 50;

  pressedKeys: string[] = [];
  throttleLevel = 0;
  brakeLevel = 0;
  controllerConnected = false;
  leftStick = { x: 0, y: 0 };
  rightStick = { x: 0, y: 0 };
  ledFrontActive = false;
  ledSweepActive = false;
  laserFrontActive = false;
  laserSweepActive = false;

  telemetry?: TelemetrySnapshot;
  orientation: Orientation = { roll: 0, pitch: 0, yaw: 0 };
  heading = 0;

  cameraFeeds: CameraFeed[] = [];
  mainFeed!: CameraFeed;

  private telemetrySub?: Subscription;
  private feedsSub?: Subscription;
  private gamepadHandle?: number;
  private lastManualThrottle = 0;
  private lastManualBrake = 0;
  private previousButtonStates: boolean[] = [];
  private cameraKeys = new Set<string>();
  private displayProfileIndex = 0;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly controlService: ControlService,
    private readonly authService: AuthService,
    private readonly videoService: VideoService,
  ) {}

  get secondaryFeeds(): CameraFeed[] {
    const mainId = this.mainFeed?.id;
    return this.cameraFeeds.filter(feed => feed.id !== mainId);
  }

  ngOnInit(): void {
    this.telemetryService.connect();
    this.feedsSub = this.videoService.feeds$.subscribe(feeds => {
      this.cameraFeeds = feeds;
      if (!this.mainFeed && feeds.length) {
        this.mainFeed = feeds[0];
      }
    });
    this.telemetrySub = this.telemetryService.telemetry$.subscribe(snapshot => {
      this.telemetry = snapshot;
      this.heading = snapshot.heading;
      this.orientation = snapshot.orientation;
    });

    this.startGamepadPolling();
  }

  ngOnDestroy(): void {
    this.telemetrySub?.unsubscribe();
    this.feedsSub?.unsubscribe();
    if (this.gamepadHandle) {
      cancelAnimationFrame(this.gamepadHandle);
    }
    this.telemetryService.disconnect();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      if (!this.pressedKeys.includes(key)) {
        this.pressedKeys = [...this.pressedKeys, key];
        this.sendDriveCommand();
        this.syncManualInput();
        this.updateKeyboardStickVisual();
      }
      event.preventDefault();
    }

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      if (!this.controllerConnected) {
        this.cameraKeys.add(key);
        this.updateKeyboardCameraStick();
      }
      this.controlService.panCamera(key);
      event.preventDefault();
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      this.pressedKeys = this.pressedKeys.filter(value => value !== key);
      this.sendDriveCommand();
      this.syncManualInput();
      this.updateKeyboardStickVisual();
      event.preventDefault();
    }

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      if (!this.controllerConnected) {
        this.cameraKeys.delete(key);
        this.updateKeyboardCameraStick();
      }
      event.preventDefault();
    }
  }

  changeDriveMode(mode: string): void {
    this.driveMode = mode;
    this.controlService.setDriveMode(mode);
  }

  changeSteeringMode(mode: string): void {
    this.steeringMode = mode;
    this.controlService.setSteeringMode(mode);
  }

  selectCamera(feed: CameraFeed): void {
    if (!this.mainFeed || feed.id === this.mainFeed.id) {
      return;
    }

    this.mainFeed = feed;
    this.controlService.selectCamera(feed.id);
  }

  logout(): void {
    this.authService.logout();
  }

  private sendDriveCommand(): void {
    const command: DriveCommand = {
      keys: this.pressedKeys,
      driveMode: this.driveMode,
      steeringMode: this.steeringMode,
    };
    this.controlService.sendDriveCommand(command);
  }

  private startGamepadPolling(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const poll = () => {
      const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      const activePad = gamepads.find(pad => pad && pad.connected);

      if (activePad) {
        this.controllerConnected = true;
        const leftX = this.applyDeadzone(activePad.axes[0] ?? 0);
        const leftY = this.applyDeadzone(activePad.axes[1] ?? 0);
        const rightX = this.applyDeadzone(activePad.axes[2] ?? 0);
        const rightY = this.applyDeadzone(activePad.axes[3] ?? 0);

        const throttle = this.clamp(activePad.buttons[7]?.value ?? 0, 0, 1);
        const brake = this.clamp(activePad.buttons[6]?.value ?? 0, 0, 1);

        this.throttleLevel = Math.round(throttle * 100);
        this.brakeLevel = Math.round(brake * 100);
        this.leftStick = { x: Number(this.clamp(leftX, -1, 1).toFixed(2)), y: Number(this.clamp(leftY, -1, 1).toFixed(2)) };
        this.rightStick = { x: Number(this.clamp(rightX, -1, 1).toFixed(2)), y: Number(this.clamp(rightY, -1, 1).toFixed(2)) };

        this.controlService.sendGamepadCommand({
          throttle: this.throttleLevel,
          brake: this.brakeLevel,
          steering: Number(this.clamp(leftX, -1, 1).toFixed(2)),
          forward: Number(this.clamp(-leftY, -1, 1).toFixed(2)),
          cameraX: Number(this.clamp(rightX, -1, 1).toFixed(2)),
          cameraY: Number(this.clamp(-rightY, -1, 1).toFixed(2)),
        });

        this.controlService.sendCameraVector(this.rightStick.x, -this.rightStick.y);
        this.telemetryService.applyManualInput(this.throttleLevel, this.brakeLevel);
        this.handleButtonEvents(activePad.buttons);
      } else {
        this.controllerConnected = false;
        this.throttleLevel = 0;
        this.brakeLevel = 0;
        this.telemetryService.applyManualInput(0, 0);
        this.lastManualThrottle = -1;
        this.lastManualBrake = -1;
        this.syncManualInput();
        this.leftStick = { x: 0, y: 0 };
        this.rightStick = { x: 0, y: 0 };
        this.previousButtonStates = [];
        this.cameraKeys.clear();
        this.controlService.sendCameraVector(0, 0);
        this.updateKeyboardStickVisual();
      }

      this.gamepadHandle = requestAnimationFrame(poll);
    };

    poll();
  }

  private syncManualInput(): void {
    if (this.controllerConnected) {
      return;
    }

    const throttle = this.pressedKeys.includes('w') ? 100 : 0;
    const brake = this.pressedKeys.includes('s') ? 100 : 0;

    this.throttleLevel = throttle;
    this.brakeLevel = brake;
    if (throttle === this.lastManualThrottle && brake === this.lastManualBrake) {
      return;
    }

    this.lastManualThrottle = throttle;
    this.lastManualBrake = brake;
    this.telemetryService.applyManualInput(throttle, brake);
    this.updateKeyboardStickVisual();
  }

  private updateKeyboardStickVisual(): void {
    if (this.controllerConnected) {
      return;
    }

    const horizontal = (this.pressedKeys.includes('d') ? 1 : 0) - (this.pressedKeys.includes('a') ? 1 : 0);
    const vertical = (this.pressedKeys.includes('s') ? 1 : 0) - (this.pressedKeys.includes('w') ? 1 : 0);
    const magnitude = Math.hypot(horizontal, vertical);

    if (magnitude === 0) {
      this.leftStick = { x: 0, y: 0 };
      return;
    }

    const normalizedX = this.clamp(horizontal / Math.max(1, magnitude), -1, 1);
    const normalizedY = this.clamp(vertical / Math.max(1, magnitude), -1, 1);
    this.leftStick = {
      x: Number(normalizedX.toFixed(2)),
      y: Number(normalizedY.toFixed(2)),
    };
  }

  private updateKeyboardCameraStick(): void {
    if (this.controllerConnected) {
      return;
    }

    const horizontal = (this.cameraKeys.has('arrowright') ? 1 : 0) - (this.cameraKeys.has('arrowleft') ? 1 : 0);
    const vertical = (this.cameraKeys.has('arrowdown') ? 1 : 0) - (this.cameraKeys.has('arrowup') ? 1 : 0);
    const magnitude = Math.hypot(horizontal, vertical);

    if (magnitude === 0) {
      this.rightStick = { x: 0, y: 0 };
      this.dispatchKeyboardCameraVector();
      return;
    }

    const normalizedX = this.clamp(horizontal / Math.max(1, magnitude), -1, 1);
    const normalizedY = this.clamp(vertical / Math.max(1, magnitude), -1, 1);
    this.rightStick = {
      x: Number(normalizedX.toFixed(2)),
      y: Number(normalizedY.toFixed(2)),
    };
    this.dispatchKeyboardCameraVector();
  }

  private dispatchKeyboardCameraVector(): void {
    if (this.controllerConnected) {
      return;
    }
    this.controlService.sendCameraVector(this.rightStick.x, -this.rightStick.y);
  }

  private handleButtonEvents(buttons: readonly GamepadButton[]): void {
    if (this.wasButtonJustPressed(buttons, 0)) {
      this.toggleLedFront();
    }

    if (this.wasButtonJustPressed(buttons, 1)) {
      this.toggleLedSweep();
    }

    if (this.wasButtonJustPressed(buttons, 2)) {
      this.toggleLaserFront();
    }

    if (this.wasButtonJustPressed(buttons, 3)) {
      this.toggleLaserSweep();
    }

    if (this.wasButtonJustPressed(buttons, 4)) {
      this.advanceSteeringMode();
    }

    if (this.wasButtonJustPressed(buttons, 5)) {
      this.advanceDriveMode();
    }

    if (this.wasButtonJustPressed(buttons, 12)) {
      this.adjustLedIntensity(10);
    }

    if (this.wasButtonJustPressed(buttons, 13)) {
      this.adjustLedIntensity(-10);
    }

    if (this.wasButtonJustPressed(buttons, 17)) {
      this.advanceDisplayProfile();
    }

    this.previousButtonStates = buttons.map(button => button.pressed);
  }

  private wasButtonJustPressed(buttons: readonly GamepadButton[], index: number): boolean {
    const current = !!buttons[index]?.pressed;
    const previous = this.previousButtonStates[index] ?? false;
    return current && !previous;
  }

  private advanceDriveMode(): void {
    const nextIndex = (this.driveModes.indexOf(this.driveMode) + 1) % this.driveModes.length;
    this.changeDriveMode(this.driveModes[nextIndex]);
  }

  private advanceSteeringMode(): void {
    const nextIndex = (this.steeringModes.indexOf(this.steeringMode) + 1) % this.steeringModes.length;
    this.changeSteeringMode(this.steeringModes[nextIndex]);
  }

  private toggleLedFront(): void {
    this.ledFrontActive = !this.ledFrontActive;
    this.controlService.toggleLedFront();
  }

  private toggleLedSweep(): void {
    this.ledSweepActive = !this.ledSweepActive;
    this.controlService.toggleLedSweep();
  }

  private toggleLaserFront(): void {
    this.laserFrontActive = !this.laserFrontActive;
    this.controlService.toggleLaserFront();
  }

  private toggleLaserSweep(): void {
    this.laserSweepActive = !this.laserSweepActive;
    this.controlService.toggleLaserSweep();
  }

  private adjustLedIntensity(delta: number): void {
    const next = this.clamp(this.ledIntensity + delta, 0, 100);
    if (next === this.ledIntensity) {
      return;
    }

    this.ledIntensity = next;
    this.controlService.setLedIntensity(this.ledIntensity);
  }

  private advanceDisplayProfile(): void {
    this.displayProfileIndex = (this.displayProfileIndex + 1) % this.displayProfiles.length;
    this.activeDisplayProfile = this.displayProfiles[this.displayProfileIndex];
    this.controlService.cycleDisplayProfile();
  }

  private applyDeadzone(value: number, threshold = 0.12): number {
    return Math.abs(value) < threshold ? 0 : value;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
