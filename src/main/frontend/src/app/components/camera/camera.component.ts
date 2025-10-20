import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface CameraFeed {
  id: string;
  name: string;
  streamUrl?: string;
  placeholder?: string;
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
}
