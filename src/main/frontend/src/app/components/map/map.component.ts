import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import * as L from 'leaflet';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() latitude = 52.52;
  @Input() longitude = 13.405;
  @Input() timestamp?: string;

  @ViewChild('mapContainer', { static: true })
  private readonly mapContainer?: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private marker?: L.CircleMarker;

  ngAfterViewInit(): void {
    if (!this.mapContainer) {
      return;
    }

    const center = this.getLatLng();

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      attributionControl: false,
    }).setView(center, 17);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(this.map);

    this.marker = L.circleMarker(center, {
      radius: 8,
      fillColor: '#007ACC',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85,
    }).addTo(this.map);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map || !this.marker) {
      return;
    }

    if (changes['latitude'] || changes['longitude']) {
      const center = this.getLatLng();
      this.marker.setLatLng(center);
      this.map.setView(center);
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private getLatLng(): L.LatLngExpression {
    return [this.latitude, this.longitude];
  }
}
