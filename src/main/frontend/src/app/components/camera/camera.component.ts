import { Component, EventEmitter, Input, Output } from '@angular/core';

export type CameraRenderMode = 'video' | 'image' | 'proxied-image';

export interface CameraFeed {
  id: string;
  name: string;
  streamUrl?: string;
  placeholder?: string;
  renderMode?: CameraRenderMode;
  rotationDegrees?: number;
  sourcePath?: string;
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
  @Input() sweepModeLabel = '';
  @Input() sweepModeBadge = '';
  @Input() sweepModeHint = 'Klick: Modus wechseln | Doppelklick: Zentrieren';

  @Output() selectFeed = new EventEmitter<CameraFeed>();
  @Output() modeToggle = new EventEmitter<void>();
  @Output() modeReset = new EventEmitter<void>();

  handleSelect(feed: CameraFeed): void {
    this.selectFeed.emit(feed);
  }

  handleModeToggle(): void {
    this.modeToggle.emit();
  }

  handleModeReset(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.modeReset.emit();
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
