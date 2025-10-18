export interface GpsCoordinate {
  lat: number;
  lng: number;
}

export interface Orientation {
  roll: number;
  pitch: number;
  yaw: number;
}

export interface TemperatureReading {
  label: string;
  value: number;
}

export interface TelemetrySnapshot {
  gps: GpsCoordinate;
  heading: number;
  orientation: Orientation;
  throttle: number;
  brake: number;
  temps: TemperatureReading[];
  accelerationHistory: number[];
  brakingHistory: number[];
  timestamp: number;
}

export type DriveMode = 'ECO' | 'NORMAL' | 'BOOST';
export type SteeringMode = '2WD' | '4WD';

export interface CameraFeed {
  id: string;
  label: string;
  streamUrl: string;
  isPrimary?: boolean;
}

export interface VehicleTask {
  id: string;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}
