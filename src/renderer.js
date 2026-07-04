// Low-res pixel renderer: ~160-px-wide virtual canvas, integer-scaled up.

export const PALETTE = [ // DawnBringer 16
  '#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524',
  '#d04648', '#757161', '#597dce', '#d27d2c', '#8595a1', '#6daa2c',
  '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6',
];
const CHARS = '0123456789abcdef';

// Compile palette-indexed rows ('.' = transparent) to an offscreen canvas.
export function compileSprite(rows) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.') continue;
    g.fillStyle = PALETTE[CHARS.indexOf(ch)];
    g.fillRect(x, y, 1, 1);
  }
  return c;
}

// Nearest-neighbour enlarge a compiled sprite by an integer factor.
export function scaleSprite(img, n) {
  const c = document.createElement('canvas');
  c.width = img.width * n; c.height = img.height * n;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const r = {
    canvas, ctx, W: 160, H: 240, scale: 1,
    view: 64, // virtual width in world px — smaller = more zoomed in
    camera: { x: 0, y: 0, mode: 'top' }, // 'top' scrolls x+y; 'side' locks y

    setView(w) {
      this.view = w;
      this.resize();
    },

    resize() {
      const dw = canvas.clientWidth, dh = canvas.clientHeight;
      this.scale = Math.max(2, Math.floor(dw / this.view));
      this.W = Math.ceil(dw / this.scale);
      this.H = Math.ceil(dh / this.scale);
      canvas.width = this.W;
      canvas.height = this.H;
      ctx.imageSmoothingEnabled = false;
    },

    follow(x, y) {
      this.camera.x = x - this.W / 2;
      this.camera.y = this.camera.mode === 'side' ? 0 : y - this.H / 2;
    },

    clear(color) {
      ctx.fillStyle = PALETTE[color];
      ctx.fillRect(0, 0, this.W, this.H);
    },

    rect(wx, wy, w, h, color) {
      ctx.fillStyle = PALETTE[color];
      ctx.fillRect(Math.round(wx - this.camera.x), Math.round(wy - this.camera.y), w, h);
    },

    px(wx, wy, color) { this.rect(wx, wy, 1, 1, color); },

    sprite(img, wx, wy, rot = 0) {
      const sx = Math.round(wx - this.camera.x), sy = Math.round(wy - this.camera.y);
      if (rot === 0) {
        ctx.drawImage(img, sx - (img.width >> 1), sy - (img.height >> 1));
        return;
      }
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      ctx.drawImage(img, -(img.width >> 1), -(img.height >> 1));
      ctx.restore();
    },

    screenToWorld(px, py) {
      return { x: px / this.scale + this.camera.x, y: py / this.scale + this.camera.y };
    },
  };
  r.resize();
  window.addEventListener('resize', () => r.resize());
  return r;
}
