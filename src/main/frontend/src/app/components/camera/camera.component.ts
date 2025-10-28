import { Component, EventEmitter, Input, Output } from '@angular/core';

export type CameraRenderMode = 'video' | 'image' | 'proxied-image';

export interface CameraFeed {
  id: string;
  name: string;
  streamUrl?: string;
  placeholder?: string;
  renderMode?: CameraRenderMode;
  rotationDegrees?: number;
}

@Component({
  selector: 'app-camera',
  templateUrl: './camera.component.html',
  styleUrls: ['./camera.component.scss'],
})
export class CameraComponent {
  @Input() mainFeed?: CameraFeed;
  @Input() secondaryFeeds: CameraFeed[] = [];
  @Input() recActive = true;

  @Output() selectFeed = new EventEmitter<CameraFeed>();

  handleSelect(feed: CameraFeed): void {
    this.selectFeed.emit(feed);
  }

  rotationStyle(feed: CameraFeed | undefined): Record<string, string> | null {
    if (!feed?.rotationDegrees) {
      return null;
    }
    return {
      transform: `rotate(${feed.rotationDegrees}deg)`,
      transformOrigin: 'center center',
    };
  }
}
