import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild
} from '@angular/core';
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from 'three';

import { Orientation } from '../../../models/telemetry.model';

@Component({
  selector: 'app-car-model',
  templateUrl: './car-model.component.html',
  styleUrls: ['./car-model.component.scss']
})
export class CarModelComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true })
  private readonly canvasElement?: ElementRef<HTMLCanvasElement>;

  private renderer?: WebGLRenderer;
  private scene?: Scene;
  private camera?: PerspectiveCamera;
  private carMesh?: Mesh;
  private animationFrameId?: number;
  private resizeObserver?: ResizeObserver;

  protected orientationState: Orientation = { roll: 0, pitch: 0, yaw: 0 };

  @Input()
  set orientation(value: Orientation | undefined) {
    if (!value) {
      return;
    }
    this.orientationState = value;
    this.applyOrientation();
  }

  ngAfterViewInit(): void {
    if (!this.canvasElement) {
      return;
    }
    this.initializeScene();
    this.renderLoop();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.canvasElement.nativeElement);
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer?.dispose();
    this.resizeObserver?.disconnect();
  }

  private initializeScene(): void {
    if (!this.canvasElement) {
      return;
    }

    const canvas = this.canvasElement.nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight || 200;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);

    this.scene = new Scene();

    this.camera = new PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 2, 5);

    const ambientLight = new AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0x007acc, 1.2);
    directionalLight.position.set(5, 10, 7);
    this.scene.add(directionalLight);

    const bodyGeometry = new BoxGeometry(2.2, 0.6, 1.2);
    const bodyMaterial = new MeshStandardMaterial({
      color: 0x2c2c2c,
      metalness: 0.4,
      roughness: 0.6
    });

    this.carMesh = new Mesh(bodyGeometry, bodyMaterial);
    this.carMesh.position.y = 0.5;
    this.scene.add(this.carMesh);

    // wheels
    const wheelGeometry = new BoxGeometry(0.5, 0.5, 0.2);
    const wheelMaterial = new MeshStandardMaterial({ color: 0x111111 });
    const wheelPositions = [
      [-0.9, 0.2, 0.6],
      [0.9, 0.2, 0.6],
      [-0.9, 0.2, -0.6],
      [0.9, 0.2, -0.6]
    ];

    wheelPositions.forEach(([x, y, z]) => {
      const wheel = new Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(x, y, z);
      this.carMesh?.add(wheel);
    });
  }

  private renderLoop(): void {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }

    this.applyOrientation();
    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
    this.renderer.render(this.scene, this.camera);
  }

  private applyOrientation(): void {
    if (!this.carMesh) {
      return;
    }
    const { roll, pitch, yaw } = this.orientationState;
    this.carMesh.rotation.set(
      this.toRadians(pitch),
      this.toRadians(yaw),
      this.toRadians(roll)
    );
  }

  private onResize(): void {
    if (!this.renderer || !this.camera || !this.canvasElement) {
      return;
    }
    const canvas = this.canvasElement.nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight || 200;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
