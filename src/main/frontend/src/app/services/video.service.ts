import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { CameraFeed } from '../components/camera/camera.component';

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private readonly feedsSubject = new BehaviorSubject<CameraFeed[]>([
    {
      id: 'front',
      name: 'Frontkamera',
      streamUrl: 'http://192.168.178.164:5000/csi_feed',
      placeholder: 'Front Cam',
      renderMode: 'proxied-image',
    },
    {
      id: 'rear',
      name: 'Rückkamera',
      streamUrl: 'http://192.168.178.164:5000/usb_feed',
      placeholder: 'Rear Cam',
      renderMode: 'image',
      rotationDegrees: 180,
    },
    {
      id: 'thermal',
      name: 'Thermal',
      streamUrl: 'http://192.168.178.164:5000/thermal_feed',
      placeholder: 'Thermal',
      renderMode: 'image',
    },
  ]);

  readonly feeds$ = this.feedsSubject.asObservable();

  get currentFeeds(): CameraFeed[] {
    return this.feedsSubject.value;
  }

  registerFeed(feed: CameraFeed): void {
    const feeds = this.feedsSubject.value;
    if (feeds.some(existing => existing.id === feed.id)) {
      return;
    }
    this.feedsSubject.next([...feeds, feed]);
  }

  updateFeed(feed: CameraFeed): void {
    const updated = this.feedsSubject.value.map(existing =>
      existing.id === feed.id ? { ...existing, ...feed } : existing,
    );
    this.feedsSubject.next(updated);
  }
}
