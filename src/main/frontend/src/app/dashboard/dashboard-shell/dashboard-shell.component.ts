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

  driveMode = this.driveModes[1];
  steeringMode = this.steeringModes[1];

  pressedKeys: string[] = [];
  throttleLevel = 0;
  brakeLevel = 0;
  controllerConnected = false;

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
      }
      event.preventDefault();
    }

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
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
        const vertical = activePad.axes[1] ?? 0;
        const throttle = Math.max(0, -vertical);
        const brake = Math.max(0, vertical);

        this.throttleLevel = Math.round(throttle * 100);
        this.brakeLevel = Math.round(brake * 100);

        this.controlService.sendGamepadCommand({
          throttle: this.throttleLevel,
          brake: this.brakeLevel,
          buttons: activePad.buttons.map(btn => btn.pressed),
        });
        this.telemetryService.applyManualInput(this.throttleLevel, this.brakeLevel);
      } else {
        this.controllerConnected = false;
        this.throttleLevel = 0;
        this.brakeLevel = 0;
        this.telemetryService.applyManualInput(0, 0);
        this.lastManualThrottle = -1;
        this.lastManualBrake = -1;
        this.syncManualInput();
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
  }
}
