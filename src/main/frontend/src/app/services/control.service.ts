import { Injectable } from '@angular/core';

export interface DriveCommand {
  keys: string[];
  driveMode: string;
  steeringMode: string;
}

export interface GamepadCommand {
  throttle: number;
  brake: number;
  buttons: boolean[];
}

@Injectable({
  providedIn: 'root',
})
export class ControlService {
  private readonly controlEndpoint = 'ws://localhost:8080/ws/control';
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
    this.ensureConnection();
    const payload = JSON.stringify({ type: 'drive', ...command });
    this.dispatch(payload);
  }

  sendGamepadCommand(command: GamepadCommand): void {
    this.ensureConnection();
    const payload = JSON.stringify({ type: 'gamepad', ...command });
    this.dispatch(payload);
  }

  setDriveMode(mode: string): void {
    this.ensureConnection();
    const payload = JSON.stringify({ type: 'mode', mode });
    this.dispatch(payload);
  }

  setSteeringMode(mode: string): void {
    this.ensureConnection();
    const payload = JSON.stringify({ type: 'steering', mode });
    this.dispatch(payload);
  }

  panCamera(direction: string): void {
    this.ensureConnection();
    const payload = JSON.stringify({ type: 'camera-pan', direction });
    this.dispatch(payload);
  }

  selectCamera(cameraId: string): void {
    this.ensureConnection();
    const payload = JSON.stringify({ type: 'camera-select', cameraId });
    this.dispatch(payload);
  }

  private dispatch(payload: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else {
      console.debug('[ControlService] Offline-Sendequeue', payload);
    }
  }
}
