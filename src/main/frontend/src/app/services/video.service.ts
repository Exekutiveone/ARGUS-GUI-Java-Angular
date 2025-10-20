import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { CameraFeed } from '../components/camera/camera.component';

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private readonly feedsSubject = new BehaviorSubject<CameraFeed[]>([
    { id: 'front', name: 'Frontkamera', placeholder: 'Front Cam' },
    { id: 'rear', name: 'Rückkamera', placeholder: 'Rear Cam' },
    { id: 'thermal', name: 'Thermal', placeholder: 'Thermal' },
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
