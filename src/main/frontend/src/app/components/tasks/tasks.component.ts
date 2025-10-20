import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status?: 'pending' | 'running' | 'done';
}

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.component.html',
  styleUrls: ['./tasks.component.scss'],
})
export class TasksComponent {
  @Input() tasks: TaskItem[] = [];
  @Input() highlightId?: string;

  @Output() taskSelected = new EventEmitter<TaskItem>();

  selectTask(task: TaskItem): void {
    this.taskSelected.emit(task);
  }
}
