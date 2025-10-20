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
  Color,
  BufferGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  Float32BufferAttribute,
  MathUtils
} from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

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
  private carGroup?: Group;
  private animationFrameId?: number;
  private resizeObserver?: ResizeObserver;
  private connectedGamepadIndex?: number;
  private readonly pointerPosition = new Vector2();

  private readonly orbitTarget = new Vector3(0, 0.8, 0);
  private orbitState = {
    radius: 4.5,
    azimuth: Math.PI / 6,
    polar: Math.PI / 2.6
  };

  private baseOrientation: Orientation = { roll: 0, pitch: 0, yaw: 0 };

  protected isPointerActive = false;
  protected orientationState: Orientation = { roll: 0, pitch: 0, yaw: 0 };

  @Input()
  set orientation(value: Orientation | undefined) {
    if (!value) {
      return;
    }
    this.orientationState = value;
    this.baseOrientation = { ...value };
    this.updateCarOrientation();
  }

  ngAfterViewInit(): void {
    if (!this.canvasElement) {
      return;
    }
    this.initializeScene();
    this.renderLoop();
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.canvasElement.nativeElement);
    window.addEventListener(
      'gamepadconnected',
      this.handleGamepadConnected,
      false
    );
    window.addEventListener(
      'gamepaddisconnected',
      this.handleGamepadDisconnected,
      false
    );
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer?.dispose();
    this.resizeObserver?.disconnect();
    window.removeEventListener(
      'gamepadconnected',
      this.handleGamepadConnected,
      false
    );
    window.removeEventListener(
      'gamepaddisconnected',
      this.handleGamepadDisconnected,
      false
    );
  }

  protected handlePointerDown(event: PointerEvent): void {
    if (!this.canvasElement) {
      return;
    }
    event.preventDefault();
    this.isPointerActive = true;
    this.pointerPosition.set(event.clientX, event.clientY);
    this.canvasElement.nativeElement.setPointerCapture(event.pointerId);
  }

  protected handlePointerMove(event: PointerEvent): void {
    if (!this.isPointerActive) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - this.pointerPosition.x;
    const deltaY = event.clientY - this.pointerPosition.y;
    this.pointerPosition.set(event.clientX, event.clientY);
    this.updateOrbit(deltaX, deltaY);
  }

  protected handlePointerUp(event: PointerEvent): void {
    if (!this.isPointerActive) {
      return;
    }
    event.preventDefault();
    this.isPointerActive = false;
    if (this.canvasElement?.nativeElement.hasPointerCapture(event.pointerId)) {
      this.canvasElement.nativeElement.releasePointerCapture(event.pointerId);
    }
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
    this.applyOrbit();

    const ambientLight = new AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0x007acc, 1.2);
    directionalLight.position.set(5, 10, 7);
    this.scene.add(directionalLight);

    this.carGroup = new Group();
    this.scene.add(this.carGroup);

    this.buildFallbackModel();
    this.loadCarModel();
  }

  private renderLoop(): void {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }

    this.updateGamepadOrbit();
    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
    this.renderer.render(this.scene, this.camera);
  }

  private loadCarModel(): void {
    const loader = new STLLoader();
    loader.load(
      'assets/models/car.stl',
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.center();
        geometry.computeBoundingBox();

        const size = new Vector3();
        geometry.boundingBox?.getSize(size);
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const scale = 3.2 / maxDimension;

        this.applyGrayscaleVertexColors(geometry);

        const material = new MeshStandardMaterial({
          vertexColors: geometry.hasAttribute('color'),
          metalness: 0.2,
          roughness: 0.35
        });

        const mesh = new Mesh(geometry, material);
        mesh.scale.setScalar(scale);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, 0.3, 0);

        this.carGroup?.clear();
        this.carGroup?.add(mesh);
        this.updateCarOrientation();
      },
      undefined,
      () => {
        this.buildFallbackModel();
      }
    );
  }

  private buildFallbackModel(): void {
    if (!this.carGroup) {
      return;
    }
    this.carGroup.clear();
    const bodyMaterial = new MeshStandardMaterial({
      color: 0x2c2c2c,
      metalness: 0.4,
      roughness: 0.6
    });
    const body = new Mesh(new BoxGeometry(2.2, 0.6, 1.2), bodyMaterial);
    body.position.y = 0.5;
    this.carGroup.add(body);

    const wheelMaterial = new MeshStandardMaterial({ color: 0x111111 });
    const wheelGeometry = new BoxGeometry(0.5, 0.5, 0.2);
    const wheelPositions = [
      [-0.9, 0.2, 0.6],
      [0.9, 0.2, 0.6],
      [-0.9, 0.2, -0.6],
      [0.9, 0.2, -0.6]
    ];

    wheelPositions.forEach(([x, y, z]) => {
      const wheel = new Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(x, y, z);
      body.add(wheel);
    });

    this.carGroup.position.set(0, 0, 0);
    this.updateCarOrientation();
  }

  private updateCarOrientation(): void {
    if (!this.carGroup) {
      return;
    }
    const { roll, pitch, yaw } = this.baseOrientation;
    this.carGroup.rotation.set(
      this.toRadians(pitch),
      this.toRadians(yaw),
      this.toRadians(roll)
    );
  }

  private updateOrbit(deltaX: number, deltaY: number): void {
    const azimuthSpeed = 0.005;
    const polarSpeed = 0.003;
    this.orbitState.azimuth -= deltaX * azimuthSpeed;
    this.orbitState.polar = this.clamp(
      this.orbitState.polar - deltaY * polarSpeed,
      0.2,
      Math.PI - 0.4
    );
    this.applyOrbit();
  }

  private applyOrbit(): void {
    if (!this.camera) {
      return;
    }
    const { radius, azimuth, polar } = this.orbitState;
    const sinPolar = Math.sin(polar);
    const x = this.orbitTarget.x + radius * sinPolar * Math.sin(azimuth);
    const z = this.orbitTarget.z + radius * sinPolar * Math.cos(azimuth);
    const y = this.orbitTarget.y + radius * Math.cos(polar);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.orbitTarget);
  }

  private updateGamepadOrbit(): void {
    const gamepads = navigator.getGamepads();
    let gamepad =
      this.connectedGamepadIndex !== undefined
        ? gamepads[this.connectedGamepadIndex]
        : undefined;

    if (!gamepad) {
      gamepad = gamepads.find((pad) => pad !== null) ?? undefined;
      if (gamepad) {
        this.connectedGamepadIndex = gamepad.index;
      }
    }

    if (!gamepad) {
      return;
    }

    const axis = gamepad.axes?.[2] ?? 0;
    const axisY = gamepad.axes?.[3] ?? 0;
    const threshold = 0.2;
    const rotationSpeed = 0.035;
    let changed = false;

    if (Math.abs(axis) > threshold) {
      this.orbitState.azimuth -= axis * rotationSpeed;
      changed = true;
    }

    if (Math.abs(axisY) > threshold) {
      this.orbitState.polar = this.clamp(
        this.orbitState.polar + axisY * rotationSpeed * 0.6,
        0.2,
        Math.PI - 0.4
      );
      changed = true;
    }

    if (changed) {
      this.applyOrbit();
    }
  }

  private handleGamepadConnected = (event: GamepadEvent): void => {
    this.connectedGamepadIndex = event.gamepad.index;
  };

  private handleGamepadDisconnected = (event: GamepadEvent): void => {
    if (this.connectedGamepadIndex === event.gamepad.index) {
      this.connectedGamepadIndex = undefined;
    }
  };

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
    this.applyOrbit();
  }

  private toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private applyGrayscaleVertexColors(geometry: BufferGeometry): void {
    const positionAttribute = geometry.getAttribute('position');
    const normalAttribute = geometry.getAttribute('normal');

    if (!positionAttribute || !normalAttribute || !geometry.boundingBox) {
      return;
    }

    const { min, max } = geometry.boundingBox;
    const heightRange = Math.max(max.y - min.y, 1e-5);
    const colors = new Float32Array(positionAttribute.count * 3);

    const lowerColor = new Color('#3c3f44');
    const midColor = new Color('#b9bdc2');
    const upperColor = new Color('#f3f5f7');

    for (let i = 0; i < positionAttribute.count; i++) {
      const vertexY = positionAttribute.getY(i);
      const normalY = normalAttribute.getY(i);

      const heightBlend = MathUtils.clamp((vertexY - min.y) / heightRange, 0, 1);
      const tonalBlend = MathUtils.clamp((normalY + 0.2) / 1.2, 0, 1);

      const baseColor = lowerColor.clone().lerp(midColor, heightBlend * 0.75);
      const finalColor = baseColor.lerp(
        upperColor,
        MathUtils.clamp(heightBlend * 0.5 + tonalBlend * 0.5, 0, 1)
      );

      const baseIndex = i * 3;
      colors[baseIndex] = finalColor.r;
      colors[baseIndex + 1] = finalColor.g;
      colors[baseIndex + 2] = finalColor.b;
    }

    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  }
}
