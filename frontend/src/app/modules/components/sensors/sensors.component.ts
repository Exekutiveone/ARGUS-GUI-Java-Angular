import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import {
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  CategoryScale
} from 'chart.js';

import { TelemetrySnapshot } from '../../../models/telemetry.model';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  Legend
);

@Component({
  selector: 'app-sensors',
  templateUrl: './sensors.component.html',
  styleUrls: ['./sensors.component.scss']
})
export class SensorsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() telemetry?: TelemetrySnapshot;

  @ViewChild('accelerationCanvas', { static: true })
  private readonly accelerationCanvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('brakingCanvas', { static: true })
  private readonly brakingCanvas?: ElementRef<HTMLCanvasElement>;

  private accelerationChart?: Chart;
  private brakingChart?: Chart;

  ngAfterViewInit(): void {
    this.initializeCharts();
    this.updateCharts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['telemetry']) {
      this.updateCharts();
    }
  }

  ngOnDestroy(): void {
    this.accelerationChart?.destroy();
    this.brakingChart?.destroy();
  }

  private initializeCharts(): void {
    if (this.accelerationCanvas && !this.accelerationChart) {
      this.accelerationChart = new Chart(this.accelerationCanvas.nativeElement, {
        type: 'line',
        data: {
          labels: Array.from({ length: 20 }, (_, index) => index.toString()),
          datasets: [
            {
              label: 'Beschleunigung',
              data: Array(20).fill(0),
              borderColor: '#007acc',
              backgroundColor: 'rgba(0, 122, 204, 0.3)',
              tension: 0.4,
              fill: true,
              pointRadius: 0
            }
          ]
        },
        options: this.chartOptions
      });
      this.accelerationChart.resize();
    }

    if (this.brakingCanvas && !this.brakingChart) {
      this.brakingChart = new Chart(this.brakingCanvas.nativeElement, {
        type: 'line',
        data: {
          labels: Array.from({ length: 20 }, (_, index) => index.toString()),
          datasets: [
            {
              label: 'Bremsdruck',
              data: Array(20).fill(0),
              borderColor: '#ff4d4f',
              backgroundColor: 'rgba(255, 77, 79, 0.3)',
              tension: 0.4,
              fill: true,
              pointRadius: 0
            }
          ]
        },
        options: this.chartOptions
      });
      this.brakingChart.resize();
    }
  }

  private updateCharts(): void {
    if (!this.telemetry) {
      return;
    }
    const { accelerationHistory, brakingHistory } = this.telemetry;

    if (this.accelerationChart && accelerationHistory) {
      this.accelerationChart.data.datasets[0].data = [
        ...accelerationHistory
      ];
      this.accelerationChart.update('none');
      this.accelerationChart.resize();
    }

    if (this.brakingChart && brakingHistory) {
      this.brakingChart.data.datasets[0].data = [...brakingHistory];
      this.brakingChart.update('none');
      this.brakingChart.resize();
    }
  }

  private get chartOptions(): Chart['options'] {
    return {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#e0e0e0'
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(18,18,18,0.9)',
          titleColor: '#ffffff',
          bodyColor: '#e0e0e0'
        }
      },
      scales: {
        x: {
          ticks: { display: false },
          grid: {
            color: 'rgba(255,255,255,0.05)'
          }
        },
        y: {
          ticks: {
            color: '#e0e0e0'
          },
          grid: {
            color: 'rgba(255,255,255,0.05)'
          }
        }
      }
    };
  }
}
