import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { ControlService, DriveCommand } from '../../services/control.service';
import { TelemetryService, TelemetrySnapshot } from '../../services/telemetry.service';
import { DeviceUpdateService } from '../../services/device-update.service';
import { VideoService } from '../../services/video.service';
import { CameraFeed } from '../../components/camera/camera.component';
import { Orientation } from '../../components/car-model/car-model.component';
import { TaskItem } from '../../components/tasks/tasks.component';
import { DeviceHostService } from '../../services/device-host.service';
import Chart from 'chart.js/auto';
import type { ChartOptions } from 'chart.js';

@Component({
  selector: 'app-dashboard-shell',
  templateUrl: './dashboard-shell.component.html',
  styleUrls: ['./dashboard-shell.component.scss'],
})
export class DashboardShellComponent implements OnInit, OnDestroy, AfterViewInit {
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
  hosts: string[] = [];
  activeHost = '';
  pendingHost = '';
  sweepModeLabel = 'Schwenk XY';
  sweepModeBadge = 'Schwenk XY';

  @ViewChild('sensorTemperatureCanvas') private readonly sensorTemperatureCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('sensorAccelerometerCanvas') private readonly sensorAccelerometerCanvas?: ElementRef<HTMLCanvasElement>;

  private sensorTemperatureChart?: Chart<'line'>;
  private sensorAccelerometerChart?: Chart<'line'>;

  private readonly syntheticSensorTemperatureSeries = this.buildSensorTemperatureSeries();
  private readonly syntheticSensorAccelerometerSeries = this.buildSensorAccelerometerSeries();

  private telemetrySub?: Subscription;
  private feedsSub?: Subscription;
  private hostsSub?: Subscription;
  private activeHostSub?: Subscription;
  private gamepadHandle?: number;
  private lastManualThrottle = 0;
  private lastManualBrake = 0;
  private lastGamepadTimestamp?: number;
  private previousButtonStates: boolean[] = [];
  private cameraKeys = new Set<string>();
  private displayProfileIndex = 0;
  private lastCameraVector?: { x: number; y: number };
  private readonly cameraVectorEpsilon = 0.01;
  private readonly ledChannels = {
    laserFront: 12,
    laserSweep: 13,
    ledSweep: 14,
    ledFront: 15,
  };
  private readonly sweepServoChannels = {
    pan: 11,
    tilt: 10,
  };
  private readonly steeringServoChannels = {
    front: 1,
    rear: 2,
  };
  private readonly servoUpdateIntervalMs = 60;
  private readonly sweepPanSpeedDegreesPerSecond = 300;
  private readonly sweepTiltSpeedDegreesPerSecond = 300;
  private readonly keyboardServoStepDegrees = 4;
  private panMode: 'xy' | 'x' | 'y' = 'xy';
  private readonly sweepModeLabels: Record<'xy' | 'x' | 'y', string> = {
    xy: 'Schwenk XY',
    x: 'Schwenk Nur X',
    y: 'Schwenk Nur Y',
  };
  private readonly modeDoublePressWindowMs = 320;
  private readonly modeToggleDelayMs = 220;
  private modeToggleTimer?: number;
  private lastModeActivationTimestamp = 0;
  private sweepPanAngle = 90;
  private sweepTiltAngle = 90;
  private lastSentSweepPan = -1;
  private lastSentSweepTilt = -1;
  private servoUpdatePending = false;
  private lastServoPushTimestamp = 0;
  private steeringAngleFront = 90;
  private steeringAngleRear = 90;
  private lastSentSteeringFront = -1;
  private lastSentSteeringRear = -1;
  private steeringUpdatePending = false;
  private lastSteeringPushTimestamp = 0;
  private readonly steeringCenterDegrees = 90;
  private readonly steeringRangeDegrees = 45;
  private readonly steeringAngleEpsilon = 0.5;
  private readonly steeringUpdateIntervalMs = 60;
  private readonly escChannel = 3;
  private readonly escNeutralDegrees = 90;
  private readonly escFullScaleDegrees = 45;
  private readonly escDeadzonePercent = 1;
  private readonly escUpdateIntervalMs = 60;
  private readonly escBrakePulseDurationMs = 200;
  private escState: 'neutral' | 'forward' | 'brakePulse' | 'reverse' = 'neutral';
  private escNeedsBrakePulse = false;
  private escDesiredPercent = 0;
  private escPendingPercent = 0;
  private escPendingAngle = this.escNeutralDegrees;
  private escUpdatePending = false;
  private lastEscPushTimestamp = 0;
  private lastEscAngleSent = -1;
  private escLastCommandPercent = 0;
  private brakePulseTimer?: number;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly controlService: ControlService,
    private readonly authService: AuthService,
    private readonly videoService: VideoService,
    private readonly deviceUpdateService: DeviceUpdateService,
    private readonly deviceHostService: DeviceHostService,
  ) {
    this.hosts = this.deviceHostService.currentHosts;
    this.activeHost = this.deviceHostService.currentBaseUrl;
    this.updateSweepModeLabels();
  }

  taskPanelView: 'tasks' | 'calibration' | 'network' = 'tasks';

  get secondaryFeeds(): CameraFeed[] {
    const mainId = this.mainFeed?.id;
    return this.cameraFeeds.filter(feed => feed.id !== mainId);
  }

  ngOnInit(): void {
    this.hostsSub = this.deviceHostService.hosts$.subscribe(hosts => {
      this.hosts = hosts;
    });
    this.activeHostSub = this.deviceHostService.baseUrl$.subscribe(host => {
      this.activeHost = host;
    });

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
      this.orientation = { ...snapshot.orientation };
      setTimeout(() => this.initSensorGraphs());
    });

    this.initialiseSweepServos();
    this.initialiseSteeringServos();
    this.initialiseEsc();
    this.startGamepadPolling();
  }

  ngAfterViewInit(): void {
    this.initSensorGraphs();
  }

  ngOnDestroy(): void {
    this.telemetrySub?.unsubscribe();
    this.feedsSub?.unsubscribe();
    this.hostsSub?.unsubscribe();
    this.activeHostSub?.unsubscribe();
    this.cancelPanModeToggle();
    if (this.gamepadHandle) {
      cancelAnimationFrame(this.gamepadHandle);
    }
    this.sensorTemperatureChart?.destroy();
    this.sensorAccelerometerChart?.destroy();
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
    this.applySteeringFromInput(this.leftStick.x);
    this.flushSteeringUpdates(this.getTimestamp(), true);
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

  addHost(): void {
    const value = this.pendingHost.trim();
    if (!value) {
      return;
    }
    this.deviceHostService.addHost(value);
    this.pendingHost = '';
  }

  selectHost(host: string): void {
    this.deviceHostService.setActiveHost(host);
  }

  removeHost(host: string, event?: Event): void {
    event?.stopPropagation();
    this.deviceHostService.removeHost(host);
  }

  trackHost(index: number, host: string): string {
    return this.deviceHostService.trackHost(index, host);
  }

  handleModeToggleRequest(): void {
    this.handlePanModeActivation();
  }

  handleModeResetRequest(): void {
    this.executePanModeReset();
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
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const deltaSeconds = this.lastGamepadTimestamp ? (now - this.lastGamepadTimestamp) / 1000 : 0;
      this.lastGamepadTimestamp = now;

      const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      const activePad = gamepads.find(pad => pad && pad.connected);

      if (activePad) {
        this.controllerConnected = true;
        const rawLeftX = activePad.axes[0] ?? 0;
        const rawLeftY = activePad.axes[1] ?? 0;
        const rawRightX = activePad.axes[2] ?? 0;
        const rawRightY = activePad.axes[3] ?? 0;

        const leftX = this.applyDeadzone(rawLeftX);
        const leftY = this.applyDeadzone(rawLeftY);
        const rightX = this.applyDeadzone(rawRightX);
        const rightY = this.applyDeadzone(rawRightY);

        const throttle = this.clamp(activePad.buttons[7]?.value ?? 0, 0, 1);
        const brake = this.clamp(activePad.buttons[6]?.value ?? 0, 0, 1);

        this.throttleLevel = Math.round(throttle * 100);
        this.brakeLevel = Math.round(brake * 100);
        this.leftStick = { x: Number(this.clamp(leftX, -1, 1).toFixed(2)), y: Number(this.clamp(leftY, -1, 1).toFixed(2)) };
        this.rightStick = { x: Number(this.clamp(rightX, -1, 1).toFixed(2)), y: Number(this.clamp(rightY, -1, 1).toFixed(2)) };
        this.applySteeringFromInput(this.clamp(leftX, -1, 1));
        this.updateEscCommand(now);

        this.controlService.sendGamepadCommand({
          throttle: this.throttleLevel,
          brake: this.brakeLevel,
          steering: Number(this.clamp(leftX, -1, 1).toFixed(2)),
          forward: Number(this.clamp(-leftY, -1, 1).toFixed(2)),
          cameraX: Number(this.clamp(rightX, -1, 1).toFixed(2)),
          cameraY: Number(this.clamp(-rightY, -1, 1).toFixed(2)),
        });

        this.emitCameraVector(this.rightStick.x, -this.rightStick.y);
        this.handleAnalogSweepControl(rightX, rightY, deltaSeconds);
        this.flushServoUpdates(now);
        this.flushSteeringUpdates(now);
        this.flushEscUpdates(now);
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
        this.applySteeringFromInput(0);
        this.rightStick = { x: 0, y: 0 };
        this.previousButtonStates = [];
        this.cameraKeys.clear();
        this.emitCameraVector(0, 0);
        this.updateKeyboardStickVisual();
        this.lastGamepadTimestamp = undefined;
        this.updateEscCommand(now);
        this.flushServoUpdates(now);
        this.flushSteeringUpdates(now, true);
        this.flushEscUpdates(now, true);
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
      const timestamp = this.getTimestamp();
      this.applySteeringFromInput(0);
      this.flushSteeringUpdates(timestamp);
      this.updateEscCommand(timestamp);
      this.flushEscUpdates(timestamp);
      return;
    }

    const normalizedX = this.clamp(horizontal / Math.max(1, magnitude), -1, 1);
    const normalizedY = this.clamp(vertical / Math.max(1, magnitude), -1, 1);
    this.leftStick = {
      x: Number(normalizedX.toFixed(2)),
      y: Number(normalizedY.toFixed(2)),
    };
    const timestamp = this.getTimestamp();
    this.applySteeringFromInput(this.leftStick.x);
    this.flushSteeringUpdates(timestamp);
    this.updateEscCommand(timestamp);
    this.flushEscUpdates(timestamp);
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
    this.emitCameraVector(this.rightStick.x, -this.rightStick.y);
    this.applyKeyboardSweepAdjustment();
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

    if (this.wasButtonJustPressed(buttons, 11)) {
      this.handlePanModeActivation();
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
    this.sendLedUpdate(this.ledChannels.ledFront, this.ledFrontActive);
  }

  private toggleLedSweep(): void {
    this.ledSweepActive = !this.ledSweepActive;
    this.controlService.toggleLedSweep();
    this.sendLedUpdate(this.ledChannels.ledSweep, this.ledSweepActive);
  }

  private toggleLaserFront(): void {
    this.laserFrontActive = !this.laserFrontActive;
    this.controlService.toggleLaserFront();
    this.sendLedUpdate(this.ledChannels.laserFront, this.laserFrontActive);
  }

  private toggleLaserSweep(): void {
    this.laserSweepActive = !this.laserSweepActive;
    this.controlService.toggleLaserSweep();
    this.sendLedUpdate(this.ledChannels.laserSweep, this.laserSweepActive);
  }

  private adjustLedIntensity(delta: number): void {
    const next = this.clamp(this.ledIntensity + delta, 0, 100);
    if (next === this.ledIntensity) {
      return;
    }

    this.ledIntensity = next;
    this.controlService.setLedIntensity(this.ledIntensity);
    this.syncActiveLeds();
  }

  private sendLedUpdate(channel: number, active: boolean): void {
    const value = active ? this.ledIntensity : 0;
    this.deviceUpdateService.sendUpdate(channel, value, 'led').subscribe();
  }

  private syncActiveLeds(): void {
   this.sendLedUpdate(this.ledChannels.ledFront, this.ledFrontActive);
   this.sendLedUpdate(this.ledChannels.ledSweep, this.ledSweepActive);
   this.sendLedUpdate(this.ledChannels.laserFront, this.laserFrontActive);
   this.sendLedUpdate(this.ledChannels.laserSweep, this.laserSweepActive);
 }

  private initialiseSteeringServos(): void {
    this.applySteeringFromInput(0);
    this.flushSteeringUpdates(this.getTimestamp(), true);
  }

  private initialiseEsc(): void {
    this.escState = 'neutral';
    this.escNeedsBrakePulse = false;
    this.escDesiredPercent = 0;
    this.queueEscPercent(0, true, this.getTimestamp());
  }

  private applySteeringFromInput(rawInput: number): void {
    const normalized = this.clamp(rawInput, -1, 1);
    const frontTarget = this.clamp(
      this.steeringCenterDegrees + normalized * this.steeringRangeDegrees,
      this.steeringCenterDegrees - this.steeringRangeDegrees,
      this.steeringCenterDegrees + this.steeringRangeDegrees,
    );
    const rearInput = this.steeringMode === '4WD' ? -normalized : 0;
    const rearTarget = this.clamp(
      this.steeringCenterDegrees + rearInput * this.steeringRangeDegrees,
      this.steeringCenterDegrees - this.steeringRangeDegrees,
      this.steeringCenterDegrees + this.steeringRangeDegrees,
    );

    const frontChanged = Math.abs(frontTarget - this.steeringAngleFront) > this.steeringAngleEpsilon;
    const rearChanged = Math.abs(rearTarget - this.steeringAngleRear) > this.steeringAngleEpsilon;

    if (frontChanged) {
      this.steeringAngleFront = frontTarget;
    }
    if (rearChanged) {
      this.steeringAngleRear = rearTarget;
    }

    if (frontChanged || rearChanged) {
      this.steeringUpdatePending = true;
    }
  }

  private flushSteeringUpdates(timestamp: number, force = false): void {
    const frontValue = Math.round(this.clamp(this.steeringAngleFront, 0, 180));
    const rearValue = Math.round(this.clamp(this.steeringAngleRear, 0, 180));

    const frontNeedsUpdate = force || frontValue !== this.lastSentSteeringFront;
    const rearNeedsUpdate = force || rearValue !== this.lastSentSteeringRear;

    if (!frontNeedsUpdate && !rearNeedsUpdate) {
      this.steeringUpdatePending = false;
      return;
    }

    if (!force && !this.steeringUpdatePending) {
      return;
    }

    if (!force && timestamp - this.lastSteeringPushTimestamp < this.steeringUpdateIntervalMs) {
      return;
    }

    if (frontNeedsUpdate) {
      this.sendServoUpdate(this.steeringServoChannels.front, frontValue);
      this.lastSentSteeringFront = frontValue;
    }

    if (rearNeedsUpdate) {
      this.sendServoUpdate(this.steeringServoChannels.rear, rearValue);
      this.lastSentSteeringRear = rearValue;
    }

    if (frontNeedsUpdate || rearNeedsUpdate) {
      this.lastSteeringPushTimestamp = timestamp;
      this.steeringUpdatePending = false;
    }
  }

  private updateEscCommand(timestamp: number): void {
    let desiredPercent = 0;

    if (this.brakeLevel > 0 && this.brakeLevel >= this.throttleLevel) {
      desiredPercent = -this.brakeLevel;
    } else if (this.throttleLevel > 0) {
      desiredPercent = this.throttleLevel;
    } else {
      const forwardAxis = this.clamp(-this.leftStick.y, -1, 1);
      desiredPercent = Math.round(forwardAxis * 100);
    }

    if (Math.abs(desiredPercent) <= this.escDeadzonePercent) {
      desiredPercent = 0;
    }

    this.applyEscInput(desiredPercent, timestamp);
  }

  private applyEscInput(percent: number, timestamp: number): void {
    const clamped = Math.round(this.clamp(percent, -100, 100));
    this.escDesiredPercent = clamped;

    if (clamped === 0) {
      this.cancelBrakePulse();
      this.escState = 'neutral';
      this.queueEscPercent(0, false, timestamp);
      return;
    }

    if (clamped > 0) {
      this.cancelBrakePulse();
      this.escState = 'forward';
      this.escNeedsBrakePulse = true;
      this.queueEscPercent(clamped, false, timestamp);
      return;
    }

    if (this.escNeedsBrakePulse && this.escState !== 'brakePulse') {
      this.startBrakePulse(timestamp);
      return;
    }

    if (this.escState === 'brakePulse') {
      return;
    }

    this.escState = 'reverse';
    this.escNeedsBrakePulse = false;
    this.queueEscPercent(clamped, false, timestamp);
  }

  private startBrakePulse(timestamp: number): void {
    this.cancelBrakePulse();
    this.escState = 'brakePulse';
    this.escNeedsBrakePulse = false;
    this.queueEscPercent(-100, true, timestamp);

    if (typeof window !== 'undefined') {
      this.brakePulseTimer = window.setTimeout(() => {
        this.brakePulseTimer = undefined;
        const now = this.getTimestamp();
        if (this.escDesiredPercent === 0) {
          this.escState = 'neutral';
          this.queueEscPercent(0, true, now);
        } else {
          this.escState = 'reverse';
          this.queueEscPercent(this.escDesiredPercent, true, now);
        }
      }, this.escBrakePulseDurationMs);
    } else {
      this.escState = this.escDesiredPercent === 0 ? 'neutral' : 'reverse';
      this.queueEscPercent(this.escDesiredPercent, true, timestamp);
    }
  }

  private cancelBrakePulse(): void {
    if (typeof window !== 'undefined' && this.brakePulseTimer != null) {
      window.clearTimeout(this.brakePulseTimer);
      this.brakePulseTimer = undefined;
    }
    if (this.escState === 'brakePulse') {
      this.escState = 'neutral';
    }
  }

  private queueEscPercent(percent: number, force = false, timestamp?: number): void {
    const clampedPercent = Math.round(this.clamp(percent, -100, 100));
    const angle = this.escPercentToAngle(clampedPercent);

    if (!force && !this.escUpdatePending && angle === this.lastEscAngleSent && clampedPercent === this.escLastCommandPercent) {
      return;
    }

    this.escPendingPercent = clampedPercent;
    this.escPendingAngle = angle;
    this.escUpdatePending = true;

    if (force) {
      this.flushEscUpdates(timestamp ?? this.getTimestamp(), true);
    }
  }

  private flushEscUpdates(timestamp: number, force = false): void {
    if (!this.escUpdatePending && !force) {
      return;
    }

    if (!force && timestamp - this.lastEscPushTimestamp < this.escUpdateIntervalMs) {
      return;
    }

    const angle = this.escPendingAngle;
    if (!force && angle === this.lastEscAngleSent) {
      this.escUpdatePending = false;
      return;
    }

    this.sendServoUpdate(this.escChannel, angle);
    this.lastEscPushTimestamp = timestamp;
    this.lastEscAngleSent = angle;
    this.escLastCommandPercent = this.escPendingPercent;
    this.escUpdatePending = false;
  }

  private escPercentToAngle(percent: number): number {
    const normalized = this.clamp(percent / 100, -1, 1);
    return Math.round(this.escNeutralDegrees + normalized * this.escFullScaleDegrees);
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

  private normalizeAngle(angle: number): number {
    let normalized = angle % 360;
    if (normalized < 0) {
      normalized += 360;
    }
    return normalized;
  }
  private getTimestamp(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private updateSweepModeLabels(): void {
    const label = this.sweepModeLabels[this.panMode];
    this.sweepModeLabel = label;
    this.sweepModeBadge = label;
  }

  private setSweepMode(mode: 'xy' | 'x' | 'y'): void {
    this.panMode = mode;
    this.updateSweepModeLabels();
  }

  private cycleSweepMode(): void {
    switch (this.panMode) {
      case 'xy':
        this.setSweepMode('x');
        break;
      case 'x':
        this.setSweepMode('y');
        break;
      default:
        this.setSweepMode('xy');
        break;
    }
  }

  private handlePanModeActivation(): void {
    const timestamp = this.getTimestamp();
    if (this.lastModeActivationTimestamp && timestamp - this.lastModeActivationTimestamp <= this.modeDoublePressWindowMs) {
      this.executePanModeReset();
      return;
    }

    this.lastModeActivationTimestamp = timestamp;
    this.schedulePanModeToggle();
  }

  private schedulePanModeToggle(): void {
    this.cancelPanModeToggle();
    if (typeof window === 'undefined') {
      this.cycleSweepMode();
      this.lastModeActivationTimestamp = 0;
      return;
    }

    this.modeToggleTimer = window.setTimeout(() => {
      this.modeToggleTimer = undefined;
      this.cycleSweepMode();
      this.lastModeActivationTimestamp = 0;
    }, this.modeToggleDelayMs);
  }

  private cancelPanModeToggle(): void {
    if (typeof window !== 'undefined' && this.modeToggleTimer != null) {
      window.clearTimeout(this.modeToggleTimer);
      this.modeToggleTimer = undefined;
    }
  }

  private executePanModeReset(): void {
    this.cancelPanModeToggle();
    this.lastModeActivationTimestamp = 0;
    this.setSweepMode('xy');
    this.centerSweepServos();
  }

  private centerSweepServos(): void {
    this.sweepPanAngle = 90;
    this.sweepTiltAngle = 90;
    this.servoUpdatePending = true;
    this.flushServoUpdates(this.getTimestamp(), true);
  }

  private initialiseSweepServos(): void {
    this.servoUpdatePending = true;
    this.flushServoUpdates(this.getTimestamp(), true);
  }

  private handleAnalogSweepControl(panInput: number, tiltInput: number, deltaSeconds: number): void {
    if (deltaSeconds <= 0) {
      return;
    }

    const panControl = this.panMode === 'y' ? 0 : -panInput;
    const tiltControl = this.panMode === 'x' ? 0 : tiltInput;

    const panDelta = panControl * this.sweepPanSpeedDegreesPerSecond * deltaSeconds;
    const tiltDelta = -tiltControl * this.sweepTiltSpeedDegreesPerSecond * deltaSeconds;

    if (panDelta === 0 && tiltDelta === 0) {
      return;
    }

    this.applySweepAdjustment(panDelta, tiltDelta);
  }

  private applyKeyboardSweepAdjustment(): void {
    const panStep =
      this.panMode === 'y' ? 0 : -this.rightStick.x * this.keyboardServoStepDegrees;
    const tiltStep =
      this.panMode === 'x' ? 0 : -this.rightStick.y * this.keyboardServoStepDegrees;

    if (panStep === 0 && tiltStep === 0) {
      return;
    }

    const changed = this.applySweepAdjustment(panStep, tiltStep);
    if (changed) {
      this.flushServoUpdates(this.getTimestamp(), true);
    }
  }

  private applySweepAdjustment(panDelta: number, tiltDelta: number): boolean {
    let changed = false;

    if (panDelta !== 0) {
      const nextPan = this.clamp(this.sweepPanAngle + panDelta, 0, 180);
      if (nextPan !== this.sweepPanAngle) {
        this.sweepPanAngle = nextPan;
        changed = true;
      }
    }

    if (tiltDelta !== 0) {
      const nextTilt = this.clamp(this.sweepTiltAngle + tiltDelta, 0, 180);
      if (nextTilt !== this.sweepTiltAngle) {
        this.sweepTiltAngle = nextTilt;
        changed = true;
      }
    }

    if (changed) {
      this.servoUpdatePending = true;
    }
    return changed;
  }

  private flushServoUpdates(timestamp: number, force = false): void {
    const panValue = Math.round(this.sweepPanAngle);
    const tiltValue = Math.round(this.sweepTiltAngle);

    const panNeedsUpdate = force || panValue !== this.lastSentSweepPan;
    const tiltNeedsUpdate = force || tiltValue !== this.lastSentSweepTilt;

    if (!panNeedsUpdate && !tiltNeedsUpdate) {
      this.servoUpdatePending = false;
      return;
    }

    if (!force && !this.servoUpdatePending) {
      return;
    }

    if (!force && timestamp - this.lastServoPushTimestamp < this.servoUpdateIntervalMs) {
      return;
    }

    if (panNeedsUpdate) {
      this.sendServoUpdate(this.sweepServoChannels.pan, panValue);
      this.lastSentSweepPan = panValue;
    }

    if (tiltNeedsUpdate) {
      this.sendServoUpdate(this.sweepServoChannels.tilt, tiltValue);
      this.lastSentSweepTilt = tiltValue;
    }

    if (panNeedsUpdate || tiltNeedsUpdate) {
      this.lastServoPushTimestamp = timestamp;
      this.servoUpdatePending = false;
    }
  }

  private sendServoUpdate(channel: number, angle: number): void {
    const value = Math.round(this.clamp(angle, 0, 180));
    this.deviceUpdateService.sendUpdate(channel, value, 'servo').subscribe();
  }

  private emitCameraVector(x: number, y: number): void {
    const effectiveX = this.panMode === 'y' ? 0 : x;
    const effectiveY = this.panMode === 'x' ? 0 : y;

    if (this.lastCameraVector) {
      const dx = Math.abs(this.lastCameraVector.x - effectiveX);
      const dy = Math.abs(this.lastCameraVector.y - effectiveY);
      if (dx < this.cameraVectorEpsilon && dy < this.cameraVectorEpsilon) {
        return;
      }
    }
    this.lastCameraVector = { x: effectiveX, y: effectiveY };
    this.controlService.sendCameraVector(effectiveX, effectiveY);
  }

  private initSensorGraphs(): void {
    if (this.sensorTemperatureCanvas && !this.sensorTemperatureChart) {
      this.sensorTemperatureChart = new Chart(this.sensorTemperatureCanvas.nativeElement.getContext('2d')!, {
        type: 'line',
        data: {
          labels: this.generateLabels(this.syntheticSensorTemperatureSeries.length),
          datasets: [
            {
              label: 'Innenraum',
              data: this.syntheticSensorTemperatureSeries,
              borderColor: '#fcb040',
              backgroundColor: 'rgba(252, 176, 64, 0.16)',
              pointRadius: 0,
              tension: 0.32,
              fill: true,
            },
          ],
        },
        options: this.sensorTemperatureChartOptions,
      });
    }

    if (this.sensorAccelerometerCanvas && !this.sensorAccelerometerChart) {
      const labels = this.generateLabels(this.syntheticSensorAccelerometerSeries.x.length);
      this.sensorAccelerometerChart = new Chart(this.sensorAccelerometerCanvas.nativeElement.getContext('2d')!, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'X-Achse',
              data: this.syntheticSensorAccelerometerSeries.x,
              borderColor: '#ff6b6b',
              backgroundColor: 'rgba(255, 107, 107, 0.12)',
              pointRadius: 0,
              tension: 0.3,
              fill: false,
            },
            {
              label: 'Y-Achse',
              data: this.syntheticSensorAccelerometerSeries.y,
              borderColor: '#32d296',
              backgroundColor: 'rgba(50, 210, 150, 0.12)',
              pointRadius: 0,
              tension: 0.3,
              fill: false,
            },
            {
              label: 'Z-Achse',
              data: this.syntheticSensorAccelerometerSeries.z,
              borderColor: '#487eb0',
              backgroundColor: 'rgba(72, 126, 176, 0.12)',
              pointRadius: 0,
              tension: 0.3,
              fill: false,
            },
          ],
        },
        options: this.sensorAccelerometerChartOptions,
      });
    }
  }

  private generateLabels(length: number): string[] {
    return Array.from({ length }, (_, index) => `${index + 1}`);
  }

  private get sensorTemperatureChartOptions(): ChartOptions<'line'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { display: false },
          grid: { display: false },
        },
        y: {
          min: 0,
          max: 80,
          ticks: {
            stepSize: 10,
            color: 'rgba(224, 224, 224, 0.6)',
            font: { size: 11 },
          },
          grid: {
            color: 'rgba(224, 224, 224, 0.08)',
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 18, 0.9)',
          borderColor: 'rgba(224, 224, 224, 0.08)',
          borderWidth: 1,
          titleColor: '#e0e0e0',
          bodyColor: '#e0e0e0',
        },
      },
    };
  }

  private get sensorAccelerometerChartOptions(): ChartOptions<'line'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { display: false },
          grid: { display: false },
        },
        y: {
          min: -3.5,
          max: 3.5,
          ticks: {
            stepSize: 1,
            color: 'rgba(224, 224, 224, 0.6)',
            font: { size: 11 },
          },
          grid: {
            color: 'rgba(224, 224, 224, 0.08)',
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: 'rgba(224, 224, 224, 0.8)',
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 18, 0.9)',
          borderColor: 'rgba(224, 224, 224, 0.08)',
          borderWidth: 1,
          titleColor: '#e0e0e0',
          bodyColor: '#e0e0e0',
        },
      },
    };
  }

  private buildSensorTemperatureSeries(): number[] {
    const length = 36;
    const base = 24;
    return Array.from({ length }, (_, index) => {
      const seasonal = Math.sin(index / 5) * 3;
      const drift = index > length / 2 ? 0.4 : -0.4;
      const noise = (Math.random() - 0.5) * 1.2;
      const value = base + seasonal + drift + noise;
      return Number(Math.max(0, value).toFixed(1));
    });
  }

  private buildSensorAccelerometerSeries(): { x: number[]; y: number[]; z: number[] } {
    const length = 48;
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];

    for (let index = 0; index < length; index += 1) {
      const time = index / 6;
      const noise = () => (Math.random() - 0.5) * 0.25;

      x.push(Number((Math.sin(time) * 1.6 + noise()).toFixed(2)));
      y.push(Number((Math.cos(time * 0.9) * 1.2 + noise()).toFixed(2)));
      z.push(Number((Math.sin(time * 1.2) * 0.8 + noise()).toFixed(2)));
    }

    return { x, y, z };
  }
}











