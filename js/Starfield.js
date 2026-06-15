const STAR_COUNT = 300;

export class Starfield {
  constructor() {
    this._stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      this._stars.push({
        x: Math.random(),          // normalized [0,1] — screen-space fraction
        y: Math.random(),
        r: Math.random() * 1.2 + 0.2,
        a: Math.random() * 0.6 + 0.4,
      });
    }
  }

  draw(ctx, canvasWidth, canvasHeight) {
    ctx.save();
    for (const s of this._stars) {
      ctx.beginPath();
      ctx.arc(s.x * canvasWidth, s.y * canvasHeight, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.a})`;
      ctx.fill();
    }
    ctx.restore();
  }
}
