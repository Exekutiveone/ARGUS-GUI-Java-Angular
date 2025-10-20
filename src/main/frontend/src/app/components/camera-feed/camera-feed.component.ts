import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CameraFeed } from '../camera/camera.component';

@Component({
  selector: 'app-camera-feed',
  templateUrl: './camera-feed.component.html',
  styleUrls: ['./camera-feed.component.scss']
})
export class CameraFeedComponent {
  @Input() feed?: CameraFeed;
  @Output() activate = new EventEmitter<CameraFeed>();

  onActivate(): void {
    if (this.feed) {
      this.activate.emit(this.feed);
    }
  }
}
