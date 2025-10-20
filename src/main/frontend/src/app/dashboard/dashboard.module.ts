import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ComponentsModule } from '../components/components.module';
import { DashboardRoutingModule } from './dashboard-routing.module';
import { DashboardShellComponent } from './dashboard-shell/dashboard-shell.component';

@NgModule({
  declarations: [
    DashboardShellComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ComponentsModule,
    DashboardRoutingModule
  ]
})
export class DashboardModule { }
