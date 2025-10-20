import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';

export interface Orientation {
  roll: number;
  pitch: number;
  yaw: number;
}

@Component({
  selector: 'app-car-model',
  templateUrl: './car-model.component.html',
  styleUrls: ['./car-model.component.scss'],
})
export class CarModelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() orientation: Orientation = { roll: 0, pitch: 0, yaw: 0 };

  @ViewChild('canvasHost', { static: true })
  private readonly canvasHost?: ElementRef<HTMLDivElement>;

  private scene?: Scene;
  private camera?: PerspectiveCamera;
  private renderer?: WebGLRenderer;
  private vehicleGroup?: Group;
  private frameId?: number;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    if (!this.canvasHost) {
      return;
    }

    const container = this.canvasHost.nativeElement;

    this.scene = new Scene();
    this.scene.background = new Color(0x121212);

    const ambient = new AmbientLight(0xffffff, 0.6);
    const keyLight = new DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(5, 10, 8);

    this.scene.add(ambient);
    this.scene.add(keyLight);

    const chassisGeo = new BoxGeometry(2.8, 0.6, 1.4);
    const chassisMat = new MeshStandardMaterial({
      color: 0x1f6fb2,
      metalness: 0.3,
      roughness: 0.65,
    });

    const cabinGeo = new BoxGeometry(1.4, 0.5, 1.1);
    const cabinMat = new MeshStandardMaterial({
      color: 0x101820,
      metalness: 0.1,
      roughness: 0.4,
    });

    const wheelGeo = new CylinderGeometry(0.35, 0.35, 0.3, 24);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.4,
    });

    const chassis = new Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.35;

    const cabin = new Mesh(cabinGeo, cabinMat);
    cabin.position.set(0.1, 0.75, 0);

    const wheels = [-1.1, 1.1].flatMap(x =>
      [-0.65, 0.65].map(z => {
        const wheel = new Mesh(wheelGeo, wheelMat);
        wheel.position.set(x, 0.2, z);
        return wheel;
      })
    );

    this.vehicleGroup = new Group();
    this.vehicleGroup.add(chassis);
    this.vehicleGroup.add(cabin);
    wheels.forEach(w => this.vehicleGroup?.add(w));

    this.scene.add(this.vehicleGroup);

    this.camera = new PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    this.camera.position.set(4, 3, 4);
    this.camera.lookAt(0, 0.5, 0);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);

    container.appendChild(this.renderer.domElement);

    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (this.camera && this.renderer) {
          this.camera.aspect = width / height;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(width, height);
        }
      }
    });
    this.resizeObserver.observe(container);

    this.updateOrientation();
    this.animate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['orientation']) {
      this.updateOrientation();
    }
  }

  ngOnDestroy(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
  }

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private updateOrientation(): void {
    if (!this.vehicleGroup) {
      return;
    }

    const { roll, pitch, yaw } = this.orientation;
    this.vehicleGroup.rotation.set(
      MathUtils.degToRad(pitch),
      MathUtils.degToRad(yaw),
      MathUtils.degToRad(roll),
      'YXZ'
    );
  }
}
