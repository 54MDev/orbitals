import { FIXED_DT } from './constants.js';

export class GameLoop {
  constructor(updateFn, renderFn) {
    this._update = updateFn;
    this._render = renderFn;
    this._lastTime = null;
    this._accumulator = 0;
    this._running = false;
    this._rafId = null;
  }

  start() {
    this._running = true;
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame(this._tick.bind(this));
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
  }

  _tick(now) {
    if (!this._running) return;

    const elapsed = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;
    this._accumulator += elapsed;

    while (this._accumulator >= FIXED_DT) {
      this._update(FIXED_DT);
      this._accumulator -= FIXED_DT;
    }

    this._render();
    this._rafId = requestAnimationFrame(this._tick.bind(this));
  }
}
