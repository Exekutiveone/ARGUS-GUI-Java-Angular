import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { DashboardRoutingModule } from './dashboard-routing.module';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { ComponentsModule } from '../components/components.module';

@NgModule({
  declarations: [DashboardComponent],
  imports: [CommonModule, ComponentsModule, RouterModule, DashboardRoutingModule]
})
export class DashboardModule {}
