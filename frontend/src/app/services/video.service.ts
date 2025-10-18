import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  map
} from 'rxjs';

import { CameraFeed } from '../models/telemetry.model';

@Injectable({
  providedIn: 'root'
})
export class VideoService {
  private readonly feeds$ = new BehaviorSubject<CameraFeed[]>([
    {
      id: 'front',
      label: 'Front Cam',
      streamUrl: 'assets/video/front-feed.mp4',
      isPrimary: true
    },
    {
      id: 'rear',
      label: 'Rear Cam',
      streamUrl: 'assets/video/rear-feed.mp4'
    },
    {
      id: 'side',
      label: 'Side Cam',
      streamUrl: 'assets/video/side-feed.mp4'
    }
  ]);

  readonly primaryFeed$: Observable<CameraFeed> = this.feeds$.pipe(
    map((feeds) => feeds.find((feed) => feed.isPrimary) ?? feeds[0])
  );

  readonly secondaryFeeds$: Observable<CameraFeed[]> = this.feeds$.pipe(
    map((feeds) => feeds.filter((feed) => !feed.isPrimary))
  );

  setPrimaryFeed(feedId: string): void {
    const feeds = this.feeds$.value.map((feed) => ({
      ...feed,
      isPrimary: feed.id === feedId
    }));
    this.feeds$.next(feeds);
  }
}
