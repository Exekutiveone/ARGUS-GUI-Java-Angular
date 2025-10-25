import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

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
  private controls?: OrbitControls;

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

    this.vehicleGroup = new Group();
    this.scene.add(this.vehicleGroup);
    this.loadModel();

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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.8;
    this.controls.target.set(0, 0.5, 0);

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
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    this.controls?.update();
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

  private loadModel(): void {
    if (!this.vehicleGroup) {
      return;
    }

    const loader = new STLLoader();
    loader.load(
      'assets/models/Car.stl',
      geometry => {
        geometry.computeBoundingBox();

        const boundingBox = geometry.boundingBox ?? new Box3();
        const size = new Vector3();
        boundingBox.getSize(size);
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;

        geometry.center();
        geometry.computeVertexNormals();

        const material = new MeshStandardMaterial({
          color: 0x1f6fb2,
          metalness: 0.35,
          roughness: 0.55,
        });

        const mesh = new Mesh(geometry, material);

        const desiredSize = 3;
        const scale = desiredSize / maxDimension;
        mesh.scale.setScalar(scale);

        mesh.rotation.x = -Math.PI / 2;

        this.vehicleGroup?.add(mesh);
        this.updateOrientation();
      },
      undefined,
      error => {
        console.error('Failed to load car STL', error);
      }
    );
  }
}
