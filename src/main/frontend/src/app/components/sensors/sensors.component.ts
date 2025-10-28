import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import Chart from 'chart.js/auto';
import type { ChartOptions } from 'chart.js';

export interface TemperatureReading {
  label: string;
  value: number;
}

@Component({
  selector: 'app-sensors',
  templateUrl: './sensors.component.html',
  styleUrls: ['./sensors.component.scss'],
})
export class SensorsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() temperatures: TemperatureReading[] = [];
  @Input() accelerationSeries: number[] = [];
  @Input() brakeSeries: number[] = [];
  @Input() speed = 0;
  @Input() battery = 0;

  @ViewChild('accCanvas') private readonly accCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('brakeCanvas') private readonly brakeCanvas?: ElementRef<HTMLCanvasElement>;

  private accelerationChart?: Chart<'line'>;
  private brakeChart?: Chart<'line'>;

  ngAfterViewInit(): void {
    this.initCharts();
    this.updateCharts();
  }

  ngOnChanges(): void {
    this.updateCharts();
  }

  ngOnDestroy(): void {
    this.accelerationChart?.destroy();
    this.brakeChart?.destroy();
  }

  private initCharts(): void {
    if (this.accCanvas && !this.accelerationChart) {
      this.accelerationChart = new Chart(this.accCanvas.nativeElement.getContext('2d')!, {
        type: 'line',
        data: {
          labels: this.generateLabels(this.accelerationSeries.length),
          datasets: [
            {
              label: 'Beschleunigung',
              data: this.accelerationSeries,
              borderColor: '#007ACC',
              backgroundColor: 'rgba(0, 122, 204, 0.25)',
              pointRadius: 0,
              tension: 0.35,
              fill: true,
            },
          ],
        },
        options: this.chartOptions,
      });
    }

    if (this.brakeCanvas && !this.brakeChart) {
      this.brakeChart = new Chart(this.brakeCanvas.nativeElement.getContext('2d')!, {
        type: 'line',
        data: {
          labels: this.generateLabels(this.brakeSeries.length),
          datasets: [
            {
              label: 'Bremsen',
              data: this.brakeSeries,
              borderColor: '#ff6b6b',
              backgroundColor: 'rgba(255, 107, 107, 0.2)',
              pointRadius: 0,
              tension: 0.35,
              fill: true,
            },
          ],
        },
        options: this.chartOptions,
      });
    }
  }

  private updateCharts(): void {
    if (this.accelerationChart) {
      this.accelerationChart.data.labels = this.generateLabels(this.accelerationSeries.length);
      this.accelerationChart.data.datasets[0].data = this.accelerationSeries;
      this.accelerationChart.update();
    }

    if (this.brakeChart) {
      this.brakeChart.data.labels = this.generateLabels(this.brakeSeries.length);
      this.brakeChart.data.datasets[0].data = this.brakeSeries;
      this.brakeChart.update();
    }
  }

  private generateLabels(length: number): string[] {
    return Array.from({ length }, (_, index) => `${index + 1}`);
  }

  private get chartOptions(): ChartOptions<'line'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { display: false },
          grid: { display: false },
        },
        y: {
          min: 0,
          max: 200,
          ticks: {
            stepSize: 20,
            color: 'rgba(224, 224, 224, 0.6)',
            font: { size: 11 },
          },
          grid: {
            color: 'rgba(224, 224, 224, 0.08)',
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(18, 18, 18, 0.9)',
          borderColor: 'rgba(224, 224, 224, 0.08)',
          borderWidth: 1,
          titleColor: '#e0e0e0',
          bodyColor: '#e0e0e0',
        },
      },
    };
  }
}
