const PART_IMGS = {};
for (const [name, src] of [
  ['pod',       'assets/pod.png'],
  ['tank',      'assets/tank.png'],
  ['engine',    'assets/engine.png'],
  ['decoupler', 'assets/decoupler.png'],
]) {
  const img = new Image();
  img.src = src;
  PART_IMGS[name] = img;
}

export const PART_DEFS = {
  pod: {
    w: 2, h: 2,
    dryMass: 800,
  },
  tank: {
    w: 2, h: 6,
    dryMass: 200,
    fuelMass: 1_800,
  },
  engine: {
    w: 2, h: 2,
    dryMass: 300,
    thrust: 150_000,
    isp: 300,
  },
  decoupler: {
    w: 2, h: 1,
    dryMass: 50,
  },
};

// All draw functions receive (ctx, px, py, cw, ch, alpha)
// px/py = top-left pixel of the part's bounding box; cw/ch = pixel dimensions.

export function drawPod(ctx, px, py, cw, ch, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const img = PART_IMGS.pod;
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, px, py, cw, ch);
    ctx.restore();
    return;
  }

  const bx = px + cw * 0.15, bw = cw * 0.7;
  const by = py + ch * 0.38, bh = ch * 0.62;

  ctx.fillStyle = '#7aaae8';
  ctx.fillRect(bx, by, bw, bh);

  ctx.fillStyle = 'rgba(180, 220, 255, 0.1)';
  ctx.fillRect(bx, by, bw * 0.32, bh);

  ctx.fillStyle = '#9dc4ff';
  ctx.beginPath();
  ctx.moveTo(px + cw * 0.5,  py + ch * 0.05);
  ctx.lineTo(px + cw * 0.85, py + ch * 0.38);
  ctx.lineTo(px + cw * 0.15, py + ch * 0.38);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(px + cw * 0.5, py + ch * 0.57, cw * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 230, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(140, 195, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);

  ctx.restore();
}

export function drawTank(ctx, px, py, cw, ch, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const img = PART_IMGS.tank;
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, px, py, cw, ch);
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#2d5a80';
  ctx.fillRect(px, py, cw, ch);

  ctx.fillStyle = 'rgba(100, 180, 255, 0.1)';
  ctx.fillRect(px, py, cw * 0.3, ch);

  ctx.strokeStyle = 'rgba(80, 160, 220, 0.2)';
  ctx.lineWidth   = 1;
  const bands = 3;
  for (let i = 1; i < bands; i++) {
    const by = py + ch * (i / bands);
    ctx.beginPath();
    ctx.moveTo(px, by);
    ctx.lineTo(px + cw, by);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(70, 155, 215, 0.32)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(px, py, cw, ch);

  ctx.restore();
}

export function drawEngine(ctx, px, py, cw, ch, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const img = PART_IMGS.engine;
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, px, py, cw, ch);
    ctx.restore();
    return;
  }

  const splitY = py + ch * 0.5;

  const topW = cw * 0.72, midW = cw * 0.42;
  ctx.fillStyle = '#507060';
  ctx.beginPath();
  ctx.moveTo(px + (cw - topW) / 2, py);
  ctx.lineTo(px + (cw + topW) / 2, py);
  ctx.lineTo(px + (cw + midW) / 2, splitY);
  ctx.lineTo(px + (cw - midW) / 2, splitY);
  ctx.closePath();
  ctx.fill();

  const bellW = cw * 0.72;
  ctx.fillStyle = '#3e5848';
  ctx.beginPath();
  ctx.moveTo(px + (cw - midW)  / 2, splitY);
  ctx.lineTo(px + (cw + midW)  / 2, splitY);
  ctx.lineTo(px + (cw + bellW) / 2, py + ch - 1);
  ctx.lineTo(px + (cw - bellW) / 2, py + ch - 1);
  ctx.closePath();
  ctx.fill();

  const throatW = cw * 0.26;
  ctx.fillStyle = '#18241e';
  ctx.beginPath();
  ctx.moveTo(px + (cw - throatW) / 2,       splitY + 1);
  ctx.lineTo(px + (cw + throatW) / 2,       splitY + 1);
  ctx.lineTo(px + (cw + throatW * 1.7) / 2, py + ch - 2);
  ctx.lineTo(px + (cw - throatW * 1.7) / 2, py + ch - 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawDecoupler(ctx, px, py, cw, ch, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const img = PART_IMGS.decoupler;
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, px, py, cw, ch);
    ctx.restore();
    return;
  }

  ctx.fillStyle = '#a88028';
  ctx.fillRect(px, py, cw, ch);

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, cw, ch);
  ctx.clip();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.lineWidth   = 2;
  for (let x = -ch; x < cw + ch; x += 9) {
    ctx.beginPath();
    ctx.moveTo(px + x,      py);
    ctx.lineTo(px + x + ch, py + ch);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 195, 45, 0.5)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(px, py, cw, ch);

  ctx.restore();
}

export const DRAW_FNS = {
  pod: drawPod,
  tank: drawTank,
  engine: drawEngine,
  decoupler: drawDecoupler,
};
