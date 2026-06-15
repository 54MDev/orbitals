import { CAMERA, PLANET } from './constants.js';

export class Camera {
  constructor(canvasWidth, canvasHeight) {
    // World-space position shown at the center of the screen
    this.x = 0;
    this.y = 0;

    // Logarithmic zoom: pixels per meter
    this._logZoom = Math.log(canvasHeight * 0.35 / PLANET.RADIUS);
    this._logZoom = Math.max(CAMERA.MIN_LOG_ZOOM, Math.min(CAMERA.MAX_LOG_ZOOM, this._logZoom));

    this.target = null;  // world-space {x, y} to track; null = fixed
  }

  get zoom() {
    return Math.exp(this._logZoom);
  }

  adjustZoom(deltaY) {
    this._logZoom -= deltaY * 0.001;
    this._logZoom = Math.max(CAMERA.MIN_LOG_ZOOM, Math.min(CAMERA.MAX_LOG_ZOOM, this._logZoom));
  }

  update() {
    if (this.target) {
      this.x = this.target.x;
      this.y = this.target.y;
    }
  }

  // World coordinates → screen pixel coordinates
  worldToScreen(wx, wy, canvasWidth, canvasHeight) {
    return {
      x: (wx - this.x) * this.zoom + canvasWidth / 2,
      y: -(wy - this.y) * this.zoom + canvasHeight / 2,
    };
  }

  // Screen pixel coordinates → world coordinates
  screenToWorld(sx, sy, canvasWidth, canvasHeight) {
    return {
      x: (sx - canvasWidth / 2) / this.zoom + this.x,
      y: -((sy - canvasHeight / 2) / this.zoom) + this.y,
    };
  }
}
