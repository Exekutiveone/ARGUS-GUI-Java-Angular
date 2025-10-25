import { Injectable } from '@angular/core';

export interface DriveCommand extends Record<string, unknown> {
  keys: string[];
  driveMode: string;
  steeringMode: string;
}

export interface GamepadCommand extends Record<string, unknown> {
  throttle: number;
  brake: number;
  steering: number;
  forward?: number;
  cameraX?: number;
  cameraY?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ControlService {
  private readonly controlEndpoint = 'ws://localhost:4800/ws/control';
  private socket?: WebSocket;

  private ensureConnection(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.socket = new WebSocket(this.controlEndpoint);
      this.socket.onopen = () => console.info('[ControlService] Verbindung aktiv');
      this.socket.onerror = (err) => console.error('[ControlService] Socketfehler', err);
    } catch (error) {
      console.warn('[ControlService] Konnte Socket nicht initialisieren', error);
      this.socket = undefined;
    }
  }

  sendDriveCommand(command: DriveCommand): void {
    this.sendMessage('drive', command);
  }

  sendGamepadCommand(command: GamepadCommand): void {
    this.sendMessage('gamepad', command);
  }

  sendCameraVector(x: number, y: number): void {
    this.sendMessage('camera-vector', { x, y });
  }

  setDriveMode(mode: string): void {
    this.sendMessage('mode', { mode });
  }

  cycleDriveMode(): void {
    this.sendMessage('mode-cycle');
  }

  setSteeringMode(mode: string): void {
    this.sendMessage('steering', { mode });
  }

  cycleSteeringMode(): void {
    this.sendMessage('steering-cycle');
  }

  panCamera(direction: string): void {
    this.sendMessage('camera-pan', { direction });
  }

  selectCamera(cameraId: string): void {
    this.sendMessage('camera-select', { cameraId });
  }

  toggleLedFront(): void {
    this.sendMessage('led-toggle', { target: 'front' });
  }

  toggleLedSweep(): void {
    this.sendMessage('led-toggle', { target: 'sweep' });
  }

  toggleLaserFront(): void {
    this.sendMessage('laser-toggle', { target: 'front' });
  }

  toggleLaserSweep(): void {
    this.sendMessage('laser-toggle', { target: 'sweep' });
  }

  setLedIntensity(level: number): void {
    this.sendMessage('led-intensity', { value: level });
  }

  cycleDisplayProfile(): void {
    this.sendMessage('display-profile-cycle');
  }

  private dispatch(payload: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else {
      console.debug('[ControlService] Offline-Sendequeue', payload);
    }
  }

  private sendMessage(type: string, data: Record<string, unknown> = {}): void {
    this.ensureConnection();
    const payload = JSON.stringify({ type, ...data });
    this.dispatch(payload);
  }
}
