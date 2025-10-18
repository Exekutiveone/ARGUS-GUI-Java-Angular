import { Component } from '@angular/core';

import { VehicleTask } from '../../../models/telemetry.model';

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss']
})
export class TasksComponent {
  readonly tasks: VehicleTask[] = [
    {
      id: 'mission-1',
      title: 'Patrouillenroute A',
      description: 'Fahre die Route von Checkpoint Alpha bis Delta ab.',
      priority: 'HIGH'
    },
    {
      id: 'mission-2',
      title: 'Sensor Kalibrieren',
      description: 'Beschleunigungssensor neu kalibrieren und Werte prüfen.',
      priority: 'MEDIUM'
    },
    {
      id: 'mission-3',
      title: 'Kamera Check',
      description:
        'Alle drei Kamera-Feeds prüfen und Fokus anpassen, falls nötig.',
      priority: 'LOW'
    }
  ];

  getPriorityBadge(priority: VehicleTask['priority']): string {
    switch (priority) {
      case 'HIGH':
        return 'Hoch';
      case 'MEDIUM':
        return 'Mittel';
      default:
        return 'Niedrig';
    }
  }
}
