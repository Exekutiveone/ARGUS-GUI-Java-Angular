import { Component, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-stream-bridge',
  templateUrl: './stream-bridge.component.html',
  styleUrls: ['./stream-bridge.component.scss'],
})
export class StreamBridgeComponent implements OnChanges, OnDestroy {
  @Input() src = '';
  @Input() rotationDegrees?: number;
  proxiedUrl?: SafeUrl;
  rotationStyle?: Record<string, string>;

  constructor(
    private readonly elementRef: ElementRef,
    private readonly sanitizer: DomSanitizer,
  ) {}

  ngOnChanges(): void {
    if (!this.src) {
      this.proxiedUrl = undefined;
      this.rotationStyle = undefined;
      return;
    }
    const base = this.resolveBaseUrl();
    const proxied = `${base}/stream-proxy?target=${encodeURIComponent(this.src)}`;
    this.proxiedUrl = this.sanitizer.bypassSecurityTrustUrl(proxied);
    this.rotationStyle = this.rotationDegrees
      ? { transform: `rotate(${this.rotationDegrees}deg)`, transformOrigin: 'center center' }
      : undefined;
  }

  ngOnDestroy(): void {
    const img: HTMLImageElement | null = this.elementRef.nativeElement.querySelector('img');
    if (img) {
      img.removeAttribute('src');
    }
  }

  private resolveBaseUrl(): string {
    // When running `ng serve`, the UI is served from localhost:4200, but the proxy lives on the backend.
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location;
      if (port === '4200') {
        return `${protocol}//${hostname}:4800`;
      }
      return '';
    }
    return '';
  }
}
