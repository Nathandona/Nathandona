// Generates every SVG the profile README uses: the hero (a design canvas where the name gets
// selected, typed and inspected) and the project tiles, each in a light and a dark version.
// All text is outlined with Geist, so nothing depends on the viewer's fonts, and everything
// animates with CSS, which GitHub keeps inside an <img>.
//
//   cd scripts && pnpm install && pnpm build
//
// Copy and projects live at the top. Change them and run it again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';
import { Mail01Icon, Linkedin01Icon, NewTwitterIcon } from '@hugeicons/core-free-icons';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const NAME = 'Nathan Donadey';
const ROLE = ['Product designer and software engineer,', 'founder of Altair Studio.'];
const PROJECTS = [
  { slug: 'altair', name: 'Altair Studio', desc: 'Websites for products that are hard to explain.', meta: 'Studio', img: 'altair-site.webp' },
  { slug: 'exogen', name: 'Exogen', desc: 'Trading bots on Binance, Hyperliquid and dYdX.', meta: 'Live', img: 'exogen-concept.webp' },
  { slug: 'orba', name: 'Orba', desc: 'A quiet, opinionated Kanban board.', meta: 'Open source', img: 'orba-concept.webp' },
  { slug: 'devora', name: 'Devora', desc: 'Scaffold a project in any language, one binary.', meta: 'Rust CLI', img: 'devora-concept.webp' },
];

const THEMES = {
  dark: {
    canvas: '#0a0a0a', dot: '#26262a', ring: '#1f1f22', frame: '#121212', panel: '#0f0f10', pill: '#1f1f22',
    fg: '#f4f4f5', muted: '#a1a1aa', subtle: '#71717a', contour: '#5b5b63', hex: 'F4F4F5',
    card: '#141414',
  },
  light: {
    canvas: '#f4f4f5', dot: '#d4d4d8', ring: '#e4e4e7', frame: '#ffffff', panel: '#ffffff', pill: '#f4f4f5',
    fg: '#0a0a0a', muted: '#52525b', subtle: '#a1a1aa', contour: '#c9c9cf', hex: '0A0A0A',
    card: '#ffffff',
  },
};
const BLUE = '#0d99ff';
const OUT_EASE = 'cubic-bezier(.2,.8,.2,1)';
const IN_OUT = 'cubic-bezier(.65,0,.35,1)';

const LINKS = [
  { slug: 'site', label: 'nathandona.com', icon: 'avatar' },
  { slug: 'altair', label: 'Altair Studio', icon: 'altair' },
  { slug: 'email', label: 'Email', icon: Mail01Icon },
  { slug: 'linkedin', label: 'LinkedIn', icon: Linkedin01Icon },
  { slug: 'x', label: 'X', icon: NewTwitterIcon },
];

/* ------------------------------------------------------------------ type */

const font = (pkg, file) => {
  const b = fs.readFileSync(path.join(HERE, 'node_modules', '@fontsource', pkg, 'files', file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const REG = font('geist-sans', 'geist-sans-latin-400-normal.woff');
const MED = font('geist-sans', 'geist-sans-latin-500-normal.woff');
const SEMI = font('geist-sans', 'geist-sans-latin-600-normal.woff');
const MONO = font('geist-mono', 'geist-mono-latin-400-normal.woff');

// opentype's toPathData sometimes prints NaN for long floats, so serialize the commands ourselves.
const n2 = (v) => String(+v.toFixed(2));
const pathData = (p) => p.commands.map((c) => c.type === 'Z' ? 'Z'
  : c.type === 'C' ? `C${n2(c.x1)} ${n2(c.y1)} ${n2(c.x2)} ${n2(c.y2)} ${n2(c.x)} ${n2(c.y)}`
  : c.type === 'Q' ? `Q${n2(c.x1)} ${n2(c.y1)} ${n2(c.x)} ${n2(c.y)}`
  : `${c.type}${n2(c.x)} ${n2(c.y)}`).join('');

// Lays out a string glyph by glyph, with kerning and `track` px of letter spacing.
function layout(f, s, x, y, size, track = 0) {
  const scale = size / f.unitsPerEm;
  const gs = f.stringToGlyphs(s);
  let cx = x;
  const glyphs = [];
  gs.forEach((g, i) => {
    glyphs.push({ d: pathData(g.getPath(cx, y, size)), empty: !g.path || g.path.commands.length === 0 });
    cx += g.advanceWidth * scale;
    if (i < gs.length - 1) cx += f.getKerningValue(g, gs[i + 1]) * scale + track;
  });
  return { glyphs, width: cx - x };
}
const width = (f, s, size, track = 0) => layout(f, s, 0, 0, size, track).width;
function text(f, s, x, y, size, fill, { anchor = 'start', track = 0, cls = '', attrs = '' } = {}) {
  const w = width(f, s, size, track);
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  const d = layout(f, s, x0, y, size, track).glyphs.map((g) => g.d).join('');
  return `<path fill="${fill}" d="${d}"${cls ? ` class="${cls}"` : ''}${attrs}/>`;
}

/* ------------------------------------------------------------------ css */

function sheet() {
  const rules = [];
  let n = 0;
  return {
    css: () => rules.join(''),
    add: (r) => rules.push(r),
    kf(frames, dur, { delay = 0, ease = 'linear', iter = 1, dir = 'normal', box = false } = {}) {
      const id = `k${(n++).toString(36)}`;
      rules.push(`@keyframes ${id}{${frames}}.${id}{animation:${id} ${dur}s ${ease} ${delay}s ${iter} ${dir} both${box ? ';transform-box:fill-box;transform-origin:0 0' : ''}}`);
      return id;
    },
  };
}
const REDUCED = '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';

/* ------------------------------------------------------------------ contours */

// Marching squares over a few soft hills, chained into polylines. Same mood as the old banner,
// but drawn as lines a designer would put in a frame.
function contours(w, h, { step = 5, levels = 20 } = {}) {
  const hills = [
    [0.72, 0.3, 0.2, 1.0], [0.95, 0.85, 0.17, 0.75], [0.56, 0.95, 0.22, 0.55],
    [1.08, 0.2, 0.14, 0.7], [0.3, 0.15, 0.18, 0.35], [0.85, 0.55, 0.09, 0.35],
  ];
  const f = (x, y) => {
    const u = x / w, v = y / w;
    let s = 0;
    for (const [cx, cy, r, a] of hills) s += a * Math.exp(-((u - cx) ** 2 + (v - cy * (h / w)) ** 2) / (2 * r * r));
    return s + 0.05 * Math.sin(u * 11 + v * 5) + 0.035 * Math.sin(v * 17 - u * 7);
  };
  const cols = Math.ceil(w / step) + 1, rows = Math.ceil(h / step) + 1;
  const g = [];
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const v = f(i * step, j * step);
    g.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  const at = (i, j) => g[j * cols + i];
  const paths = [];
  for (let l = 1; l <= levels; l++) {
    const t = lo + ((hi - lo) * l) / (levels + 1);
    const segs = [];
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      const idx = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = i * step, y = j * step;
      const lerp = (p, q) => (t - p) / (q - p);
      const T = [x + step * lerp(a, b), y], R = [x + step, y + step * lerp(b, c)];
      const B = [x + step * lerp(d, c), y + step], L = [x, y + step * lerp(a, d)];
      const table = {
        1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[L, T], [B, R]], 6: [[T, B]], 7: [[L, T]],
        8: [[L, T]], 9: [[T, B]], 10: [[T, R], [L, B]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]],
      };
      for (const s of table[idx]) segs.push(s);
    }
    // Chain segments that share endpoints into polylines.
    const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    const ends = new Map();
    segs.forEach((s, k) => { for (const p of s) { const kk = key(p); (ends.get(kk) || ends.set(kk, []).get(kk)).push(k); } });
    const used = new Set();
    for (let k = 0; k < segs.length; k++) {
      if (used.has(k)) continue;
      used.add(k);
      const line = [segs[k][0], segs[k][1]];
      for (const dir of [1, 0]) {
        for (;;) {
          const tip = dir ? line[line.length - 1] : line[0];
          const next = (ends.get(key(tip)) || []).find((m) => !used.has(m));
          if (next === undefined) break;
          used.add(next);
          const s = segs[next];
          const p = key(s[0]) === key(tip) ? s[1] : s[0];
          dir ? line.push(p) : line.unshift(p);
        }
      }
      if (line.length > 3) paths.push(`M${line.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}`);
    }
  }
  return paths.join('');
}

/* ------------------------------------------------------------------ hero */

function hero(themeName) {
  const c = THEMES[themeName];
  const s = sheet();
  const W = 846, H = 400, TOP = 44, PX = 600;
  const FX = 40, FY = 92, FW = 520, FH = 268;
  const NX = FX + 40, NY = 204, NSIZE = 60, TRACK = -5;

  // Canvas, grid and chrome.
  let out = `<defs>
<clipPath id="win"><rect width="${W}" height="${H}" rx="14"/></clipPath>
<clipPath id="fr"><rect x="${FX}" y="${FY}" width="${FW}" height="${FH}"/></clipPath>
<pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r=".9" fill="${c.dot}"/></pattern>
<linearGradient id="fade" x1="${FX}" x2="${FX + FW}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".45" stop-color="#fff" stop-opacity=".22"/><stop offset=".8" stop-color="#fff"/></linearGradient>
<mask id="cm"><rect x="${FX}" y="${FY}" width="${FW}" height="${FH}" fill="url(#fade)"/></mask>
</defs><g clip-path="url(#win)">
<rect width="${W}" height="${H}" fill="${c.canvas}"/>
<rect y="${TOP}" width="${PX}" height="${H - TOP}" fill="url(#dots)"/>
<rect width="${W}" height="${TOP}" fill="${c.panel}"/><path d="M0 ${TOP - 0.5}H${W}" stroke="${c.ring}"/>`;
  out += text(MED, 'Nathandona', 20, 26.5, 12.5, c.subtle);
  const crumb = 20 + width(MED, 'Nathandona', 12.5);
  out += text(MED, '/', crumb + 7, 26.5, 12.5, c.subtle) + text(MED, 'Profile', crumb + 18, 26.5, 12.5, c.fg);
  out += text(MONO, '100%', W - 20, 26.5, 11, c.subtle, { anchor: 'end' });
  out += `<circle cx="${W - 66}" cy="22" r="10" fill="${BLUE}"/>` + text(SEMI, 'N', W - 66, 26, 11, '#fff', { anchor: 'middle' });

  // Frame with drifting contours.
  const frameIn = s.kf('from{opacity:0}to{opacity:1}', 0.5, { delay: 0.1 });
  out += `<g class="${frameIn}">` + text(MED, 'Hero', FX, FY - 9, 11, c.subtle);
  out += `<rect x="${FX}" y="${FY}" width="${FW}" height="${FH}" fill="${c.frame}"/></g>`;
  const cIn = s.kf('from{opacity:0}to{opacity:1}', 1.4, { delay: 0.4, ease: OUT_EASE });
  const drift = s.kf('from{transform:translate(0,0)}to{transform:translate(-70px,-16px)}', 36, { ease: 'ease-in-out', iter: 'infinite', dir: 'alternate' });
  out += `<g clip-path="url(#fr)"><g mask="url(#cm)" class="${cIn}"><g class="${drift}"><path transform="translate(${FX} ${FY})" fill="none" stroke="${c.contour}" stroke-width=".8" d="${contours(FW + 90, FH + 30)}"/></g></g></g>`;

  // The name, typed glyph by glyph after the selection is drawn.
  const name = layout(SEMI, NAME, NX, NY, NSIZE, TRACK);
  const bb = SEMI.getPath(NAME, NX, NY, NSIZE, { letterSpacing: TRACK / NSIZE }).getBoundingBox();
  const sx = Math.floor(bb.x1) - 6, sy = Math.floor(bb.y1) - 6;
  const sw = Math.ceil(bb.x2 - bb.x1) + 12, sh = Math.ceil(bb.y2 - bb.y1) + 12;
  let k = 0;
  for (const g of name.glyphs) {
    if (g.empty) { k++; continue; }
    const cls = s.kf('from{opacity:0}to{opacity:1}', 0.12, { delay: 2.55 + k++ * 0.055 });
    out += `<path class="${cls}" fill="${c.fg}" d="${g.d}"/>`;
  }
  ROLE.forEach((line, i) => {
    const cls = s.kf(`from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}`, 0.6, { delay: 3.4 + i * 0.12, ease: OUT_EASE });
    out += text(REG, line, NX, NY + 60 + i * 22, 15, c.muted, { cls, track: -0.1 });
  });

  // Selection drawn by the cursor, then handles and the size pill.
  const CUR_T = 2.2, CUR_D = 0.3;
  const A = [330, 345], S = [sx, sy], E = [sx + sw, sy + sh];
  const tr = (p) => `transform:translate(${p[0]}px,${p[1]}px)`;
  const cur = s.kf(`0%{opacity:0;${tr(A)};animation-timing-function:${IN_OUT}}12%{opacity:1}50%{${tr(S)}}60%{${tr(S)};animation-timing-function:${OUT_EASE}}95%,100%{opacity:1;${tr(E)}}`, CUR_T, { delay: CUR_D });
  const sel = s.kf(`0%,60%{opacity:0;transform:scale(.001);animation-timing-function:${OUT_EASE}}61%{opacity:1}95%,100%{opacity:1;transform:scale(1)}`, CUR_T, { delay: CUR_D, box: true });
  out += `<g class="${sel}"><rect x="${sx + 0.5}" y="${sy + 0.5}" width="${sw - 1}" height="${sh - 1}" fill="none" stroke="${BLUE}"/></g>`;
  const handles = s.kf('from{opacity:0}to{opacity:1}', 0.2, { delay: CUR_D + CUR_T - 0.05 });
  out += `<g class="${handles}" fill="${c.frame}" stroke="${BLUE}">`;
  for (const [hx, hy] of [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]]) out += `<rect x="${hx - 3}" y="${hy - 3}" width="6" height="6"/>`;
  const dims = `${sw} × ${sh}`;
  const pw = width(MONO, dims, 10) + 12;
  out += `<rect x="${sx + sw / 2 - pw / 2}" y="${sy + sh + 8}" width="${pw}" height="16" rx="3" fill="${BLUE}" stroke="none"/>`;
  out += text(MONO, dims, sx + sw / 2, sy + sh + 19.5, 10, '#fff', { anchor: 'middle', attrs: ' stroke="none"' }) + '</g>';
  out += `<g class="${cur}" transform="translate(${E[0]} ${E[1]})"><path d="M0 0V16.5L4.4 12.6L7.4 19L10.2 17.8L7.3 11.5H13Z" fill="${BLUE}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>`;
  out += `<rect x="13" y="19" width="${width(MED, 'Nathan', 11) + 14}" height="19" rx="5" fill="${BLUE}"/>` + text(MED, 'Nathan', 20, 32, 11, '#fff') + '</g>';

  // Inspector. It settles on Design, then swaps between Design and Code on a loop.
  out += `<rect x="${PX}" y="${TOP}" width="${W - PX}" height="${H - TOP}" fill="${c.panel}"/><path d="M${PX + 0.5} ${TOP}V${H}" stroke="${c.ring}"/>`;
  const L = PX + 16, R = W - 16;
  const dW = width(MED, 'Design', 12), cX = L + dW + 28, cW = width(MED, 'Code', 12);
  const LOOP = { delay: 5.5, iter: 'infinite', ease: IN_OUT };
  const showA = s.kf('0%,44%{opacity:1}50%,94%{opacity:0}100%{opacity:1}', 12, LOOP);
  const showB = s.kf('0%,44%{opacity:0}50%,94%{opacity:1}100%{opacity:0}', 12, LOOP);
  const sc = ((cW + 16) / (dW + 16)).toFixed(4);
  const pill = s.kf(`0%,44%{transform:translateX(0) scaleX(1)}50%,94%{transform:translateX(${cX - L}px) scaleX(${sc})}100%{transform:translateX(0) scaleX(1)}`, 12, { ...LOOP, box: true });
  out += `<rect class="${pill}" x="${L - 8}" y="58" width="${dW + 16}" height="24" rx="6" fill="${c.pill}"/>`;
  out += text(MED, 'Design', L, 74, 12, c.subtle) + text(MED, 'Code', cX, 74, 12, c.subtle);
  out += `<g class="${showA}">${text(MED, 'Design', L, 74, 12, c.fg)}</g><g class="${showB}" opacity="0">${text(MED, 'Code', cX, 74, 12, c.fg)}</g>`;
  out += `<path d="M${PX} 96.5H${W}" stroke="${c.ring}"/>`;

  let row = 0;
  const rowIn = () => s.kf('from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:none}', 0.4, { delay: 2.7 + row++ * 0.06, ease: OUT_EASE });
  const header = (t, y) => `<g class="${rowIn()}">${text(SEMI, t, L, y, 11.5, c.fg)}</g>`;
  const prop = (label, value, y, extra = '') => `<g class="${rowIn()}">${text(REG, label, L, y, 12, c.muted)}${extra}${text(MED, value, R, y, 12, c.fg, { anchor: 'end' })}</g>`;
  let design = header('Text', 122);
  const props = [['Font', 'Geist'], ['Weight', 'Semibold'], ['Size', String(NSIZE)], ['Letter spacing', `${TRACK}px`], ['Line height', '100%']];
  props.forEach(([a, b], i) => { design += prop(a, b, 150 + i * 26); });
  const hexW = width(MED, c.hex, 12);
  design += prop('Fill', c.hex, 150 + 5 * 26, `<rect x="${R - hexW - 19}" y="${150 + 5 * 26 - 10}" width="12" height="12" rx="3" fill="${c.fg}" stroke="${c.ring}"/>`);
  design += `<path d="M${PX} 300.5H${W}" stroke="${c.ring}"/>`;
  design += header('Layout', 326) + prop('Padding', '40', 354) + prop('Gap', '16', 380);
  out += `<g class="${showA}">${design}</g>`;

  // Code view: the same heading as it ships.
  const CS = 11.5, adv = width(MONO, 'M', CS);
  const col = { s: c.subtle, m: c.muted, f: c.fg, b: BLUE };
  const code = [
    [['<', 's'], ['h1', 'm']],
    [['  className', 'm'], ['=', 's'], ['"font-semibold', 'f']],
    [['    text-[60px]', 'f']],
    [['    leading-none', 'f']],
    [['    tracking-[-5px]', 'b'], ['"', 'f']],
    [['>', 's']],
    [['  ' + NAME, 'f']],
    [['</', 's'], ['h1', 'm'], ['>', 's']],
  ];
  let codeOut = '';
  code.forEach((tokens, i) => {
    const y = 126 + i * 22;
    codeOut += text(MONO, String(i + 1), L + 8, y, 10.5, c.subtle, { anchor: 'end' });
    let x = L + 22;
    for (const [t, k2] of tokens) {
      const lead = t.length - t.trimStart().length;
      if (t.trim()) codeOut += text(MONO, t.trim(), x + lead * adv, y, CS, col[k2]);
      x += t.length * adv;
    }
  });
  out += `<g class="${showB}" opacity="0">${codeOut}</g>`;

  out += `</g><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="13.5" fill="none" stroke="${c.ring}"/>`;
  const alt = `A design canvas. A frame with topographic contour lines holds the name ${NAME}, set in Geist at ${NSIZE}px with ${TRACK}px letter spacing. A cursor selects it while an inspector shows the type settings and the code that ships it. ${ROLE.join(' ')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${alt}"><title>${NAME}</title><style>${s.css()}${REDUCED}</style>${out}</svg>`;
}

/* ------------------------------------------------------------------ tiles */

const TW = 423, TH = 320, IW = 411, IH = 257;
const images = {};
async function image(file) {
  if (!images[file]) {
    const buf = await sharp(path.join(HERE, 'src', file)).resize(IW * 2, IH * 2, { fit: 'cover', position: 'top' }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
    images[file] = `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  return images[file];
}

async function tile(p, themeName) {
  const c = THEMES[themeName];
  const s = sheet();
  let out = `<defs><clipPath id="i"><rect x="6" y="6" width="${IW}" height="${IH}" rx="9"/></clipPath></defs>`;
  out += `<rect x=".5" y=".5" width="${TW - 1}" height="${TH - 1}" rx="13.5" fill="${c.card}" stroke="${c.ring}"/>`;
  out += `<image href="${await image(p.img)}" x="6" y="6" width="${IW}" height="${IH}" preserveAspectRatio="xMidYMin slice" clip-path="url(#i)"/>`;
  out += `<rect x="6.5" y="6.5" width="${IW - 1}" height="${IH - 1}" rx="8.5" fill="none" stroke="${c.ring}"/>`;
  out += text(SEMI, p.name, 18, 290, 15, c.fg, { track: -0.3 });
  out += text(REG, p.desc, 18, 308, 12.5, c.muted);
  const mx = TW - 18;
  out += text(MONO, p.meta, mx, 290, 10.5, c.subtle, { anchor: 'end' });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}" role="img" aria-label="${p.name}: ${p.desc}"><title>${p.name}</title><style>${s.css()}${REDUCED}</style>${out}</svg>`;
}

/* ------------------------------------------------------------------ links */

// The Altair mark: a rounded square with the chevron, inverted in dark mode so it never sinks
// into GitHub's dark background.
const ALTAIR_PATH = 'M28.6 14h6.8L51 50h-7.4L32 22.4 20.4 50H13z';
const altairMark = (x, y, size, square, glyph) =>
  `<g transform="translate(${x} ${y}) scale(${size / 64})"><rect width="64" height="64" rx="15" fill="${square}"/><path d="${ALTAIR_PATH}" fill="${glyph}"/></g>`;
const altairIcon = (themeName) => {
  const [sq, gl] = themeName === 'dark' ? ['#f4f4f5', '#0a0a0a'] : ['#161616', '#ffffff'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>Altair Studio</title>${altairMark(0, 0, 64, sq, gl)}</svg>`;
};

// Hugeicons are [tag, attrs] arrays drawn on a 24px grid.
const hugeicon = (icon, x, y, size, color) => {
  const kebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  const body = icon.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key')
    .map(([k, v]) => `${kebab(k)}="${v === 'currentColor' ? color : v}"`).join(' ')}/>`).join('');
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none">${body}</g>`;
};

// The drawn portrait, small enough to sit in a link chip.
const AVATAR = `data:image/png;base64,${(await sharp(path.join(HERE, 'src', 'avatar.png')).extract({ left: 250, top: 110, width: 780, height: 780 }).resize(72, 72).png({ palette: true }).toBuffer()).toString('base64')}`;

function chip(l, themeName) {
  const c = THEMES[themeName];
  const H = 34, M = 3, PAD = 12, ICON = 15, GAP = 8, SIZE = 13;
  const w = PAD + ICON + GAP + width(MED, l.label, SIZE, -0.1) + PAD;
  const W = Math.ceil(w + M * 2);
  const iy = M + (H - ICON) / 2;
  const AV = 20, ax = M + PAD - (AV - ICON) / 2, ay = M + (H - AV) / 2;
  const icon = l.icon === 'altair'
    ? altairMark(M + PAD, iy, ICON, c.fg, c.card)
    : l.icon === 'avatar'
      ? `<clipPath id="av"><circle cx="${ax + AV / 2}" cy="${ay + AV / 2}" r="${AV / 2}"/></clipPath><image href="${AVATAR}" x="${ax}" y="${ay}" width="${AV}" height="${AV}" clip-path="url(#av)"/><circle cx="${ax + AV / 2}" cy="${ay + AV / 2}" r="${AV / 2 - 0.25}" fill="none" stroke="${c.ring}" stroke-width=".5"/>`
      : hugeicon(l.icon, M + PAD, iy, ICON, c.muted);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + M * 2}" viewBox="0 0 ${W} ${H + M * 2}" role="img" aria-label="${l.label}"><title>${l.label}</title>`
    + `<rect x="${M + 0.5}" y="${M + 0.5}" width="${w - 1}" height="${H - 1}" rx="9.5" fill="${c.card}" stroke="${c.ring}"/>${icon}`
    + text(MED, l.label, M + PAD + ICON + GAP, M + H / 2 + 4.6, SIZE, c.fg, { track: -0.1 }) + '</svg>';
}

/* ------------------------------------------------------------------ companies */

// Each company mark sits in the same rounded square as the Altair icon, in one ink, so the
// experience list reads as one set. Paths come from each company's own logo (src/marks).
const MARKS = JSON.parse(fs.readFileSync(path.join(HERE, 'src', 'marks', 'marks.json'), 'utf8'));
// NETexcom's logo fuses its cloud with the lettering, so the cloud is redrawn as one clean shape.
const CLOUD = (fill) => `<g fill="${fill}"><circle cx="21.5" cy="36" r="8"/><circle cx="32" cy="28.5" r="11"/><circle cx="43" cy="35" r="9"/><rect x="21.5" y="34" width="21.5" height="10"/></g>`;
// Bounding box of the cloud: x 13.5 to 52 (left and right circles), y 17.5 to 44 (top circle to base).
const CLOUD_DX = 32 - (13.5 + 52) / 2, CLOUD_DY = 32 - (17.5 + 44) / 2;
function companyIcon(slug, themeName, fit = 36) {
  if (slug === 'netexcom') {
    const [sq, gl] = themeName === 'dark' ? ['#f4f4f5', '#0a0a0a'] : ['#161616', '#ffffff'];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${sq}"/><g transform="translate(${CLOUD_DX} ${CLOUD_DY})">${CLOUD(gl)}</g></svg>`;
  }
  const { d, box, rule, clip, stroke } = MARKS[slug];
  const [sq, gl] = themeName === 'dark' ? ['#f4f4f5', '#0a0a0a'] : ['#161616', '#ffffff'];
  const [x0, y0, x1, y1] = box;
  const k = fit / Math.max(x1 - x0, y1 - y0);
  const tx = 32 - ((x0 + x1) / 2) * k, ty = 32 - ((y0 + y1) / 2) * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${sq}"/>`
    + (clip ? `<clipPath id="c"><path d="${clip}"/></clipPath>` : '')
    + `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})"${clip ? ' clip-path="url(#c)"' : ''}>`
    + `<path fill="${gl}" fill-rule="${rule}"${stroke ? ` stroke="${gl}" stroke-width="${stroke}" stroke-linejoin="round"` : ''} d="${d}"/></g></svg>`;
}

/* ------------------------------------------------------------------ write */

const write = (name, svg) => {
  fs.writeFileSync(path.join(OUT, name), svg);
  console.log(`${name.padEnd(22)} ${(svg.length / 1024).toFixed(0)} KB`);
};
for (const t of Object.keys(THEMES)) {
  write(`hero-${t}.svg`, hero(t));
  for (const p of PROJECTS) write(`tile-${p.slug}-${t}.svg`, await tile(p, t));
  for (const l of LINKS) write(`link-${l.slug}-${t}.svg`, chip(l, t));
  write(`altair-${t}.svg`, altairIcon(t));
  write(`co-ovh-${t}.svg`, companyIcon('ovh', t, 38));
  write(`co-netexcom-${t}.svg`, companyIcon('netexcom', t, 44));
  write(`co-basesud-${t}.svg`, companyIcon('basesud', t, 34));
}
