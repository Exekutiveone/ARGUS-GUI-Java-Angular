import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild
} from '@angular/core';
import * as L from 'leaflet';

import { GpsCoordinate } from '../../../models/telemetry.model';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true })
  private readonly mapContainer?: ElementRef<HTMLDivElement>;

  currentPosition?: GpsCoordinate;

  private map?: L.Map;
  private marker?: L.Marker;

  private pendingPosition?: GpsCoordinate;

  @Input()
  set position(position: GpsCoordinate | undefined) {
    if (!position) {
      return;
    }

    if (!this.map) {
      this.pendingPosition = position;
      return;
    }

    this.updatePosition(position);
  }

  ngAfterViewInit(): void {
    if (!this.mapContainer) {
      return;
    }

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      attributionControl: false
    }).setView([52.52, 13.405], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      minZoom: 3,
      maxZoom: 19
    }).addTo(this.map);

    this.marker = L.marker([52.52, 13.405], {
      icon: L.icon({
        iconUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        popupAnchor: [0, -20]
      })
    }).addTo(this.map);

    if (this.pendingPosition) {
      this.updatePosition(this.pendingPosition);
      this.pendingPosition = undefined;
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private updatePosition(position: GpsCoordinate): void {
    if (!this.map || !this.marker) {
      return;
    }
    const latLng = L.latLng(position.lat, position.lng);
    this.currentPosition = position;
    this.marker.setLatLng(latLng);
    this.map.flyTo(latLng, this.map.getZoom(), {
      duration: 0.8,
      animate: true
    });
  }
}
