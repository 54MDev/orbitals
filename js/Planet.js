import { PLANET } from './constants.js';

export class Planet {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.radius = PLANET.RADIUS;
    this.atmosphereAltitude = PLANET.ATMOSPHERE_ALTITUDE;
    this.mass = PLANET.MASS;
  }

  draw(ctx, camera, canvasWidth, canvasHeight) {
    const center = camera.worldToScreen(this.x, this.y, canvasWidth, canvasHeight);
    const r = this.radius * camera.zoom;
    const atmoR = (this.radius + this.atmosphereAltitude) * camera.zoom;

    // Atmosphere gradient — only draw if it's visible on screen
    if (atmoR > 0.5) {
      const grad = ctx.createRadialGradient(
        center.x, center.y, Math.max(r, 0),
        center.x, center.y, atmoR,
      );
      grad.addColorStop(0, 'rgba(80, 140, 255, 0.35)');
      grad.addColorStop(0.5, 'rgba(80, 140, 255, 0.15)');
      grad.addColorStop(1, 'rgba(80, 140, 255, 0)');

      ctx.beginPath();
      ctx.arc(center.x, center.y, atmoR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Planet surface
    if (r > 0.5) {
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#2d6b27';
      ctx.fill();
    } else {
      // Planet is too small to render properly — draw as a dot
      ctx.beginPath();
      ctx.arc(center.x, center.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#2d6b27';
      ctx.fill();
    }
  }
}
