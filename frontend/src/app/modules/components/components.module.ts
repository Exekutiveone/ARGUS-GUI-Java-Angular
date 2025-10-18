import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MapComponent } from './map/map.component';
import { CompassComponent } from './compass/compass.component';
import { CarModelComponent } from './car-model/car-model.component';
import { CameraComponent } from './camera/camera.component';
import { ControlsComponent } from './controls/controls.component';
import { SensorsComponent } from './sensors/sensors.component';
import { TasksComponent } from './tasks/tasks.component';

@NgModule({
  declarations: [
    MapComponent,
    CompassComponent,
    CarModelComponent,
    CameraComponent,
    ControlsComponent,
    SensorsComponent,
    TasksComponent
  ],
  imports: [CommonModule],
  exports: [
    MapComponent,
    CompassComponent,
    CarModelComponent,
    CameraComponent,
    ControlsComponent,
    SensorsComponent,
    TasksComponent
  ]
})
export class ComponentsModule {}
