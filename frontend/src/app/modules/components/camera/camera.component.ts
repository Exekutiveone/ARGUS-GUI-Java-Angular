import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output
} from '@angular/core';

import { CameraFeed } from '../../../models/telemetry.model';
import { ControlService } from '../../../services/control.service';

@Component({
  selector: 'app-camera',
  templateUrl: './camera.component.html',
  styleUrls: ['./camera.component.scss']
})
export class CameraComponent {
  @Input() primaryFeed: CameraFeed | null | undefined = null;
  @Input() secondaryFeeds: CameraFeed[] = [];
  @Output() feedSelected = new EventEmitter<CameraFeed>();

  constructor(private readonly controlService: ControlService) {}
 
  selectFeed(feed: CameraFeed): void {
    this.feedSelected.emit(feed);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const { key } = event;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      return;
    }
    event.preventDefault();

    const delta = this.getCameraAdjustment(key);
    this.controlService.adjustCamera(delta.pan, delta.tilt);
  }

  private getCameraAdjustment(key: string): { pan: number; tilt: number } {
    switch (key) {
      case 'ArrowUp':
        return { pan: 0, tilt: 3 };
      case 'ArrowDown':
        return { pan: 0, tilt: -3 };
      case 'ArrowLeft':
        return { pan: -3, tilt: 0 };
      case 'ArrowRight':
        return { pan: 3, tilt: 0 };
      default:
        return { pan: 0, tilt: 0 };
    }
  }
}
