import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-compass',
  templateUrl: './compass.component.html',
  styleUrls: ['./compass.component.scss']
})
export class CompassComponent {
  @Input() heading = 0;

  get rotationStyle(): Record<string, string> {
    return {
      transform: `rotate(${this.heading}deg)`
    };
  }
}
