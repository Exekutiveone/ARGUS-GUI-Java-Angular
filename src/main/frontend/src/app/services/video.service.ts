import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { CameraFeed } from '../components/camera/camera.component';
import { DeviceHostService } from './device-host.service';

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private readonly feedSourcePath = new Map<string, string>();
  private readonly feedsSubject: BehaviorSubject<CameraFeed[]>;
  readonly feeds$: Observable<CameraFeed[]>;

  constructor(private readonly deviceHostService: DeviceHostService) {
    const defaults = this.buildDefaultFeeds(this.deviceHostService.currentBaseUrl);
    this.feedsSubject = new BehaviorSubject<CameraFeed[]>(defaults);
    this.feeds$ = this.feedsSubject.asObservable();

    this.deviceHostService.baseUrl$.subscribe(baseUrl => {
      this.applyBaseUrl(baseUrl);
    });
  }

  get currentFeeds(): CameraFeed[] {
    return this.feedsSubject.value;
  }

  registerFeed(feed: CameraFeed): void {
    if (this.currentFeeds.some(existing => existing.id === feed.id)) {
      return;
    }

    const normalized = { ...feed };
    if (feed.sourcePath) {
      const path = this.normalizePath(feed.sourcePath);
      this.feedSourcePath.set(feed.id, path);
      normalized.sourcePath = path;
    }

    const resolved = this.withBaseUrl(this.deviceHostService.currentBaseUrl, normalized);
    this.feedsSubject.next([...this.currentFeeds, resolved]);
  }

  updateFeed(feed: CameraFeed): void {
    const normalizedSource = feed.sourcePath ? this.normalizePath(feed.sourcePath) : undefined;
    if (normalizedSource) {
      this.feedSourcePath.set(feed.id, normalizedSource);
    }

    const updated = this.currentFeeds.map(existing => {
      if (existing.id !== feed.id) {
        return existing;
      }
      const merged: CameraFeed = {
        ...existing,
        ...feed,
        sourcePath: normalizedSource ?? existing.sourcePath,
      };
      return this.withBaseUrl(this.deviceHostService.currentBaseUrl, merged);
    });

    this.feedsSubject.next(updated);
  }

  private buildDefaultFeeds(baseUrl: string): CameraFeed[] {
    const templates: CameraFeed[] = [
      {
        id: 'front',
        name: 'Frontkamera',
        placeholder: 'Front Cam',
        renderMode: 'proxied-image',
        sourcePath: '/csi_feed',
      },
      {
        id: 'rear',
        name: 'Rueckkamera',
        placeholder: 'Rear Cam',
        renderMode: 'image',
        rotationDegrees: 180,
        sourcePath: '/usb_feed',
      },
      {
        id: 'thermal',
        name: 'Thermal',
        placeholder: 'Thermal',
        renderMode: 'image',
        sourcePath: '/thermal_feed',
      },
    ];

    return templates.map(template => {
      const path = template.sourcePath ? this.normalizePath(template.sourcePath) : undefined;
      if (path) {
        this.feedSourcePath.set(template.id, path);
        return this.withBaseUrl(baseUrl, { ...template, sourcePath: path });
      }
      return { ...template };
    });
  }

  private applyBaseUrl(baseUrl: string): void {
    const updated = this.currentFeeds.map(feed => this.withBaseUrl(baseUrl, feed));
    this.feedsSubject.next(updated);
  }

  private withBaseUrl(baseUrl: string, feed: CameraFeed): CameraFeed {
    const sourcePath = this.feedSourcePath.get(feed.id) ?? feed.sourcePath;
    if (!sourcePath) {
      return { ...feed };
    }
    const normalizedPath = this.normalizePath(sourcePath);
    this.feedSourcePath.set(feed.id, normalizedPath);
    return {
      ...feed,
      sourcePath: normalizedPath,
      streamUrl: this.composeStreamUrl(baseUrl, normalizedPath),
    };
  }

  private composeStreamUrl(baseUrl: string, path: string): string {
    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const sanitizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${sanitizedBase}${sanitizedPath}`;
  }

  private normalizePath(path: string): string {
    if (!path) {
      return '';
    }
    const trimmed = path.replace(/\/+$/, '');
    if (!trimmed) {
      return '/';
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
}
