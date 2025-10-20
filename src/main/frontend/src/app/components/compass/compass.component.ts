import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-compass',
  templateUrl: './compass.component.html',
  styleUrls: ['./compass.component.scss'],
})
export class CompassComponent {
  @Input() heading = 0;

  get directionLabel(): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(this.heading / 45) % directions.length;
    return directions[(index + directions.length) % directions.length];
  }
}
