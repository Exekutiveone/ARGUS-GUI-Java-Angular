import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';

import { MapComponent } from './map/map.component';
import { CompassComponent } from './compass/compass.component';
import { CarModelComponent } from './car-model/car-model.component';
import { CameraComponent } from './camera/camera.component';
import { ControlsComponent } from './controls/controls.component';
import { SensorsComponent } from './sensors/sensors.component';
import { TasksComponent } from './tasks/tasks.component';
import { CameraFeedComponent } from './camera-feed/camera-feed.component';
import { StreamBridgeComponent } from './stream-bridge/stream-bridge.component';
import { CalibrationComponent } from './calibration/calibration.component';

@NgModule({
  declarations: [
    MapComponent,
    CompassComponent,
    CarModelComponent,
    CameraComponent,
    ControlsComponent,
    SensorsComponent,
    TasksComponent,
    CameraFeedComponent,
    StreamBridgeComponent,
    CalibrationComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    LeafletModule,
  ],
  exports: [
    MapComponent,
    CompassComponent,
    CarModelComponent,
    CameraComponent,
    ControlsComponent,
    SensorsComponent,
    TasksComponent,
    CameraFeedComponent,
    StreamBridgeComponent,
    CalibrationComponent,
  ]
})
export class ComponentsModule { }
