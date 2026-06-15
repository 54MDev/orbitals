export class Input {
  constructor() {
    this._keys = new Set();
    window.addEventListener('keydown', e => {
      this._keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => this._keys.delete(e.code));
  }

  held(code) { return this._keys.has(code); }
}
