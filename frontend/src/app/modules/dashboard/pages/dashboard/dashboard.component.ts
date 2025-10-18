import { Component } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CameraFeed,
  TelemetrySnapshot
} from '../../../../models/telemetry.model';
import { TelemetryService } from '../../../../services/telemetry.service';
import { VideoService } from '../../../../services/video.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  readonly telemetry$: Observable<TelemetrySnapshot>;
  readonly primaryFeed$: Observable<CameraFeed>;
  readonly secondaryFeeds$: Observable<CameraFeed[]>;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly videoService: VideoService
  ) {
    this.telemetry$ = this.telemetryService.telemetry$;
    this.primaryFeed$ = this.videoService.primaryFeed$;
    this.secondaryFeeds$ = this.videoService.secondaryFeeds$;
  }

  handleFeedSelected(feed: CameraFeed): void {
    this.videoService.setPrimaryFeed(feed.id);
  }
}
