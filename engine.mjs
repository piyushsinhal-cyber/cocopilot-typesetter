// Cocopilot typesetter. The image model makes the photograph (the "plate"); this engine sets every word on top like a
// senior designer would: a 12-column grid with fixed margins and an 8 px baseline, a role-based type scale, measured
// line breaking with balanced lines, auto-fit sizes, contrast measured from the real pixels under each text group (a
// feathered scrim is added only when needed), pills and chips for price and CTA, trust ticks, and the logo on the right
// ground. It returns the finished banner (PNG, base64) and a measurement report for the art-director loop.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import opentype from 'opentype.js';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ---------- fonts (static WOFF files from Fontsource; latin + latin-ext so the rupee sign is always present)
const FAMILIES = {
  'Playfair Display': { pkg: 'playfair-display', w: [500, 600, 700], italic: true },
  'Cormorant Garamond': { pkg: 'cormorant-garamond', w: [500, 600, 700], italic: true },
  'Bodoni Moda': { pkg: 'bodoni-moda', w: [500, 600, 700], italic: true },
  'DM Serif Display': { pkg: 'dm-serif-display', w: [400], italic: true },
  'Manrope': { pkg: 'manrope', w: [500, 600, 700, 800], italic: false },
  'Inter': { pkg: 'inter', w: [500, 600, 700, 800], italic: false },
  'Oswald': { pkg: 'oswald', w: [500, 600, 700], italic: false },
  'Great Vibes': { pkg: 'great-vibes', w: [400], italic: false }
};
const fileOf = (pkg, sub, w, style) => path.join(path.dirname(require.resolve('@fontsource/' + pkg + '/package.json')), 'files', pkg + '-' + sub + '-' + w + '-' + style + '.woff');
let FONT_CACHE = null;
function loadFonts() {
  if (FONT_CACHE) return FONT_CACHE;
  const satoriFonts = []; const measure = {};
  for (const [name, f] of Object.entries(FAMILIES)) {
    for (const w of f.w) for (const style of (f.italic ? ['normal', 'italic'] : ['normal'])) {
      for (const sub of ['latin', 'latin-ext']) {
        const fn = fileOf(f.pkg, sub, w, style); if (!fs.existsSync(fn)) continue;
        const buf = fs.readFileSync(fn); satoriFonts.push({ name: sub === 'latin' ? name : name + ' X', data: buf, weight: w, style });
        try { const ot = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); (measure[name + '|' + w + '|' + style] = measure[name + '|' + w + '|' + style] || []).push(ot); } catch (e) {}
      }
    }
  }
  FONT_CACHE = { satoriFonts, measure }; return FONT_CACHE;
}
function nearestWeight(name, w) { const ws = (FAMILIES[name] || FAMILIES['Manrope']).w; return ws.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a, ws[0]); }
function famOk(name, fallback) { return FAMILIES[name] ? name : fallback; }
// width of a string in px (kerned), falling back across the latin / latin-ext files for missing glyphs
function textWidth(str, font, size, weight, style, trackingEm) {
  const M = loadFonts().measure[font + '|' + nearestWeight(font, weight) + '|' + style] || loadFonts().measure[font + '|' + nearestWeight(font, weight) + '|normal'] || [];
  if (!M.length) return str.length * size * 0.55;
  let wsum = 0;
  for (const ch of Array.from(str)) { const f = M.find(o => o.charToGlyph(ch).index > 0) || M[0]; wsum += f.getAdvanceWidth(ch, size, { kerning: true }); }
  return wsum + (trackingEm || 0) * size * Math.max(0, Array.from(str).length - 1);
}

// ---------- line breaking: balanced lines (minimise the raggedness), never a one-word last line when avoidable
function breakLines(text, maxW, font, size, weight, style, tracking, maxLines) {
  if (String(text).indexOf('\n') !== -1) { const ls = String(text).split('\n').map(t => t.trim()).filter(Boolean); return ls.every(l => textWidth(l, font, size, weight, style, tracking) <= maxW) && ls.length <= Math.max(maxLines, ls.length) ? ls : null; }
  const words = String(text).trim().split(/\s+/); const W = (s) => textWidth(s, font, size, weight, style, tracking);
  if (W(words.join(' ')) <= maxW) return [words.join(' ')];
  let best = null;
  const n = words.length;
  const rec = (start, lines) => {
    if (lines.length > maxLines) return;
    if (start === n) { const ws = lines.map(W); if (Math.max(...ws) > maxW) return; const avg = ws.reduce((a, b) => a + b, 0) / ws.length;
      let cost = ws.reduce((a, w) => a + (w - avg) ** 2, 0) + lines.length * 1e4; if (lines.length > 1 && lines[lines.length - 1].split(' ').length === 1) cost += 5e5; if (!best || cost < best.cost) best = { lines: lines.slice(), cost }; return; }
    for (let end = start + 1; end <= n; end++) { const line = words.slice(start, end).join(' '); if (W(line) > maxW && end > start + 1) break; lines.push(line); rec(end, lines); lines.pop(); }
  };
  rec(0, []);
  return best ? best.lines : null;
}

// ---------- pixels: decode the plate (JPEG) and sample luminance in a region
// ---------- finishing grade (what a retoucher does last): filmic tone curve, split tone, midtone grain, optical vignette.
// It makes every pixel belong to one photograph and removes the over-clean "AI" look. Applied to the photo only.
function finishPlate(img, f) {
  const d = img.data, W0 = img.width, H0 = img.height; const lift = f.lift != null ? f.lift : 0.025, roll = f.rolloff != null ? f.rolloff : 0.06, con = f.contrast != null ? f.contrast : 0.06;
  const warm = f.warmth != null ? f.warmth : 0.02, cool = f.shadow_cool != null ? f.shadow_cool : 0.012, grain = f.grain != null ? f.grain : 0.022, vig = f.vignette != null ? f.vignette : 0.16;
  let seed = 1234567; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const cx = W0 / 2, cy = H0 / 2, rmax = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) { const i = (y * W0 + x) * 4;
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255; const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const curve = (v) => { v = v + con * Math.sin(2 * Math.PI * (v - 0.5)) / (2 * Math.PI) * -1 * -1; v = lift + v * (1 - lift); return v - roll * Math.pow(v, 4); };
    r = curve(r); g = curve(g); b = curve(b);
    r += warm * L - cool * (1 - L) * 0.5; b += -warm * L * 0.8 + cool * (1 - L);
    const n = gauss() * grain * (0.35 + 2.6 * L * (1 - L)); r += n; g += n; b += n;
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / rmax; const vg = 1 - vig * Math.pow(dist, 2.2); r *= vg; g *= vg; b *= vg;
    d[i] = Math.max(0, Math.min(255, r * 255)); d[i + 1] = Math.max(0, Math.min(255, g * 255)); d[i + 2] = Math.max(0, Math.min(255, b * 255)); }
  return 'data:image/jpeg;base64,' + Buffer.from(jpeg.encode({ data: d, width: W0, height: H0 }, 93).data).toString('base64');
}
// mono logo: recolour every visible pixel (alpha kept) - how studios put a logo on photography
function tintLogo(dataUri, hex) { try { const png = PNG.sync.read(Buffer.from(String(dataUri).replace(/^data:image\/\w+;base64,/, ''), 'base64')); const [r, g, b] = hexRgb(hex);
  for (let i = 0; i < png.data.length; i += 4) { if (png.data[i + 3] > 0) { png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; } }
  return 'data:image/png;base64,' + PNG.sync.write(png).toString('base64'); } catch (e) { return dataUri; } }
function decodePlate(dataUri) { const b64 = String(dataUri).replace(/^data:image\/\w+;base64,/, ''); return jpeg.decode(Buffer.from(b64, 'base64'), { useTArray: true, formatAsRGBA: true }); }
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const hexRgb = (h) => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0); };
const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
function regionStats(img, x, y, w, h, scale) {
  const X0 = Math.max(0, Math.floor(x / scale)), Y0 = Math.max(0, Math.floor(y / scale)), X1 = Math.min(img.width, Math.ceil((x + w) / scale)), Y1 = Math.min(img.height, Math.ceil((y + h) / scale));
  const step = Math.max(1, Math.floor(Math.min(X1 - X0, Y1 - Y0) / 40)); const L = []; let edges = 0, cnt = 0;
  for (let yy = Y0; yy < Y1; yy += step) for (let xx = X0; xx < X1; xx += step) { const i = (yy * img.width + xx) * 4; const l = relLum(img.data[i], img.data[i + 1], img.data[i + 2]); L.push(l);
    if (xx + step < X1) { const j = (yy * img.width + xx + step) * 4; edges += Math.abs(l - relLum(img.data[j], img.data[j + 1], img.data[j + 2])); cnt++; } }
  if (!L.length) return { mean: 0.5, p10: 0.5, p90: 0.5, busy: 0 };
  L.sort((a, b) => a - b); const mean = L.reduce((a, b) => a + b, 0) / L.length;
  return { mean, p10: L[Math.floor(L.length * 0.1)], p90: L[Math.floor(L.length * 0.9)], busy: cnt ? edges / cnt : 0 };
}

// ---------- the type system: role defaults (px at a 1080 canvas), overridable per item
const ROLE = {
  kicker:   { font: 'text', w: 700, size: 18, track: 0.22, upper: true, lh: 1.2, gapAfter: 16 },
  headline: { font: 'display', w: 600, size: 78, track: -0.01, lh: 1.04, maxLines: 3, gapAfter: 22 },
  subline:  { font: 'display', w: 500, size: 30, italic: true, track: 0, lh: 1.2, maxLines: 2, gapAfter: 22 },
  product:  { font: 'text', w: 600, size: 23, track: 0.01, lh: 1.25, maxLines: 2, gapAfter: 22 },
  price:    { font: 'text', w: 800, size: 54, track: -0.01, lh: 1.0, gapAfter: 22 },
  cta:      { font: 'text', w: 700, size: 22, track: 0.02, lh: 1.0, gapAfter: 20 },
  proof:    { font: 'text', w: 600, size: 18, track: 0.01, lh: 1.3, gapAfter: 12 },
  note:     { font: 'text', w: 500, size: 16, track: 0.01, lh: 1.3, gapAfter: 10 },
  script:   { font: 'script', w: 400, size: 64, track: 0, lh: 1.0, gapAfter: 14 },
  rule:     { gapAfter: 22 }
};
const DENSITY = { tight: 0.75, normal: 1, airy: 1.3 };
const CHECK = (col) => 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="none" stroke="' + col + '" stroke-width="2"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>').toString('base64');
const snap = (v, g) => Math.round(v / g) * g;
// opacity of a directional scrim at a point (for later groups' contrast decisions)
function alphaAt(s0, x, y) { const v = s0.dir === 'left' || s0.dir === 'right' ? x : y; const near = s0.dir === 'left' || s0.dir === 'top';
  if (near) return v <= s0.e ? s0.a : v >= s0.f ? 0 : s0.a * (s0.f - v) / (s0.f - s0.e);
  return v >= s0.e ? s0.a : v <= s0.f ? 0 : s0.a * (v - s0.f) / (s0.e - s0.f); }

export async function typeset(spec) {
  const W = Number(spec.width) || 1080, H = Number(spec.height) || 1080, S = W / 1080; // all role sizes are designed at 1080
  const MARGIN = Math.round((spec.margin_pct != null ? spec.margin_pct : 6.5) / 100 * W); const BASE = 8 * S;
  const T = spec.type || {}; const fam = { display: famOk(T.display, 'Playfair Display'), text: famOk(T.text, 'Manrope'), script: famOk(T.script, 'Great Vibes') };
  const P = Object.assign({ light: '#FBF6EE', dark: '#17120F', accent: '#C9A24B', accent_ink: '#17120F' }, spec.palette || {});
  const img = spec.plate ? decodePlate(spec.plate) : null; const pxScale = img ? W / img.width : 1;
  if (img && spec.finish !== false) spec.plate = finishPlate(img, spec.finish || {});
  const report = { groups: [], warnings: [], margin: MARGIN, fonts: fam };
  const layers = [];
  if (spec.plate) layers.push({ type: 'img', props: { src: spec.plate, width: W, height: H, style: { position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' } } });
  const colX = (c) => MARGIN + (W - 2 * MARGIN) * (c / 12);
  const scrims = []; const blocks = [];

  for (const [gi, g] of (spec.groups || []).entries()) {
    // zone: columns (0-12) and rows as % of height; default full width
    const z = g.zone || {}; const x0 = colX(z.col != null ? z.col : 0), x1 = colX(z.col_end != null ? z.col_end : 12);
    const y0 = Math.max(MARGIN, (z.top_pct != null ? z.top_pct : 0) / 100 * H), y1 = Math.min(H - MARGIN, (z.bottom_pct != null ? z.bottom_pct : 100) / 100 * H);
    const zw = x1 - x0; const align = g.align || 'left'; const dens = DENSITY[g.density] || 1;
    // measure every item at its size; shrink the headline (or the whole group) until it fits the zone
    let shrink = 1; let laid = null;
    for (let tries = 0; tries < 14; tries++) {
      laid = []; let hsum = 0; let ok = true;
      for (const it of (g.items || [])) {
        const R = Object.assign({}, ROLE[it.role] || ROLE.note); const font = fam[it.font || R.font] || fam.text;
        const isHead = it.role === 'headline' || it.role === 'script';
        let size = (it.size || R.size) * S * (isHead ? shrink : Math.max(0.85, shrink));
        const weight = it.weight || R.w; const style = (it.italic != null ? it.italic : R.italic) ? 'italic' : 'normal'; const track = it.tracking != null ? it.tracking : (R.track || 0);
        let text = it.text == null ? '' : String(it.text); if ((it.upper != null ? it.upper : R.upper)) text = text.toUpperCase();
        let lines = [text], wMax = 0, h = 0;
        if (it.role === 'rule') { h = 2 * S; wMax = (it.length || 64) * S; }
        else if (it.role === 'proof') { const items = Array.isArray(it.items) ? it.items : String(text).split(/\s*[·|]\s*/).filter(Boolean); lines = items; const iw = items.map(t => textWidth(t, font, size, weight, style, track) + size * 1.5); wMax = iw.reduce((a, b) => a + b, 0) + (items.length - 1) * 22 * S; if (it.inline === false || wMax > zw) { it._stack = true; it._iw = iw; wMax = Math.max(...iw); h = items.length * size * R.lh + (items.length - 1) * 6 * S; } else { it._stack = false; it._iw = iw; h = size * R.lh; } }
        else if (it.role === 'cta' || (it.role === 'price' && it.style && it.style !== 'plain')) { const tw = textWidth(text, font, size, weight, style, track); const padX = (it.role === 'cta' ? 34 : 22) * S, padY = (it.role === 'cta' ? 17 : 10) * S; wMax = tw + 2 * padX; h = size + 2 * padY; }
        else { lines = breakLines(text, zw, font, size, weight, style, track, it.max_lines || R.maxLines || 2); if (!lines) { ok = false; lines = [text]; } wMax = Math.max(...lines.map(l => textWidth(l, font, size, weight, style, track))); h = lines.length * size * R.lh; }
        laid.push({ it, R, font, size, weight, style, track, lines, w: wMax, h, gap: (it.gap_after != null ? it.gap_after * S : R.gapAfter * S) * dens });
        hsum += h + (laid.length < g.items.length ? laid[laid.length - 1].gap : 0);
      }
      // price + cta on one row when the group asks for it
      if (g.price_cta_row) { const p = laid.find(l => l.it.role === 'price'), c = laid.find(l => l.it.role === 'cta'); if (p && c) { const rowW = p.w + 28 * S + c.w; if (rowW <= zw) { hsum -= c.h + p.gap; hsum += Math.max(0, c.h - p.h); c._row = p; } } }
      if (ok && hsum <= (y1 - y0) + 1) { laid.total = hsum; break; }
      shrink *= 0.93; laid.total = hsum;
    }
    if (shrink < 0.999) report.warnings.push('group ' + (g.name || gi) + ': type reduced to ' + Math.round(shrink * 100) + '% to fit its zone');
    if (laid.total > (y1 - y0) + 1) report.warnings.push('group ' + (g.name || gi) + ': does not fit its zone even after shrinking - give it more room or fewer words');
    const va = g.valign || 'top'; let y = va === 'bottom' ? y1 - laid.total : va === 'middle' ? (y0 + y1 - laid.total) / 2 : y0; y = snap(y, BASE);
    const gx0 = Math.min(...laid.map(l => align === 'left' ? x0 : align === 'right' ? x1 - l.w : (x0 + x1 - l.w) / 2)), gx1 = Math.max(...laid.map(l => align === 'left' ? x0 + l.w : align === 'right' ? x1 : (x0 + x1 + l.w) / 2));
    const box = { x: gx0, y, w: gx1 - gx0, h: laid.total };
    // colour: measure the plate under the group, choose light or dark ink, add a feathered scrim only if needed
    let ink = g.color && g.color !== 'auto' ? g.color : null; let stats = img ? regionStats(img, box.x - 16 * S, box.y - 16 * S, box.w + 32 * S, box.h + 32 * S, pxScale) : { mean: 0.1, p10: 0.1, p90: 0.1, busy: 0 };
    // the ground a reader sees includes scrims already placed by earlier groups
    { const cxp = box.x + box.w / 2, cyp = box.y + box.h / 2; for (const s0 of scrims) { const al = alphaAt(s0, cxp, cyp); if (al > 0) { ['mean', 'p10', 'p90'].forEach(k => { stats[k] = stats[k] * (1 - al) + s0.L * al; }); stats.busy *= (1 - al); } } }
    if (!ink) ink = contrast(relLum(...hexRgb(P.light)), stats.p90) >= contrast(relLum(...hexRgb(P.dark)), stats.p10) ? P.light : P.dark;
    const inkL = relLum(...hexRgb(ink)); const worst = inkL > 0.5 ? stats.p90 : stats.p10; let c = contrast(inkL, worst);
    const need = laid.some(l => ['proof', 'note', 'product', 'kicker'].includes(l.it.role)) ? 4.5 : 3;
    let scrim = null;
    if (g.scrim !== 'none' && (c < need || stats.busy > 0.06 || g.scrim === 'force')) {
      const sc = inkL > 0.5 ? P.dark : P.light; const scL = relLum(...hexRgb(sc));
      let a = 0; for (a = 0.2; a <= 0.9; a += 0.05) { const L2 = worst * (1 - a) + scL * a; if (contrast(inkL, L2) >= need + 0.5) break; } a = Math.min(0.9, a);
      const [r, gg, b] = hexRgb(sc); const pad = 36 * S; a = Math.min(a, 0.78);
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2; const col = (al) => 'rgba(' + r + ',' + gg + ',' + b + ',' + al.toFixed(2) + ')';
      // editorial scrim: a soft directional fade from the side (or top / bottom) where the type sits - never a box
      if (cx < W * 0.45) { const e = Math.min(W, box.x + box.w + pad), f = Math.min(W, e + 300 * S); scrim = { x: 0, y: 0, w: W, h: H, dir: 'left', e, f, a, L: scL, bg: 'linear-gradient(90deg, ' + col(a) + ' 0%, ' + col(a) + ' ' + Math.round(e / W * 100) + '%, ' + col(0) + ' ' + Math.round(f / W * 100) + '%)', rgba: col(a) }; }
      else if (cx > W * 0.55) { const e = Math.max(0, box.x - pad), f = Math.max(0, e - 300 * S); scrim = { x: 0, y: 0, w: W, h: H, dir: 'right', e, f, a, L: scL, bg: 'linear-gradient(90deg, ' + col(0) + ' ' + Math.round(f / W * 100) + '%, ' + col(a) + ' ' + Math.round(e / W * 100) + '%, ' + col(a) + ' 100%)', rgba: col(a) }; }
      else if (cy > H / 2) { const e = Math.max(0, box.y - pad), f = Math.max(0, e - 280 * S); scrim = { x: 0, y: 0, w: W, h: H, dir: 'bottom', e, f, a, L: scL, bg: 'linear-gradient(180deg, ' + col(0) + ' ' + Math.round(f / H * 100) + '%, ' + col(a) + ' ' + Math.round(e / H * 100) + '%, ' + col(a) + ' 100%)', rgba: col(a) }; }
      else { const e = Math.min(H, box.y + box.h + pad), f = Math.min(H, e + 280 * S); scrim = { x: 0, y: 0, w: W, h: H, dir: 'top', e, f, a, L: scL, bg: 'linear-gradient(180deg, ' + col(a) + ' 0%, ' + col(a) + ' ' + Math.round(e / H * 100) + '%, ' + col(0) + ' ' + Math.round(f / H * 100) + '%)', rgba: col(a) }; }
      scrims.push(scrim); c = contrast(inkL, worst * (1 - a) + scL * a);
    }
    report.groups.push({ name: g.name || ('group' + gi), box: Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)])), ink, contrast: Math.round(c * 10) / 10, needed: need, busy_ground: Math.round(stats.busy * 1000) / 1000, scrim: scrim ? scrim.rgba : null,
      items: laid.map(l => ({ role: l.it.role, size: Math.round(l.size / S), lines: l.lines })) });
    if (c < need) report.warnings.push('group ' + (g.name || gi) + ': contrast ' + c.toFixed(1) + ' is below ' + need);
    blocks.push({ laid, x0, x1, y, align, ink });
  }
  // keep-clear boxes from the layout step (product, face, hero detail) as % of the canvas
  for (const [ai, a0] of (spec.keep_clear || []).entries()) { const ax = a0.x_pct / 100 * W, ay = a0.y_pct / 100 * H, aw = a0.w_pct / 100 * W, ah = a0.h_pct / 100 * H;
    for (const gr of report.groups) { const b = gr.box; const ix = Math.max(0, Math.min(b.x + b.w, ax + aw) - Math.max(b.x, ax)), iy = Math.max(0, Math.min(b.y + b.h, ay + ah) - Math.max(b.y, ay));
      if (ix * iy > 0.04 * b.w * b.h) report.warnings.push('group ' + gr.name + ' covers ' + (a0.label || ('keep-clear area ' + ai)) + ' (' + Math.round(100 * ix * iy / (b.w * b.h)) + '% of the text block) - move it'); } }
  // overlap check between groups
  for (let i = 0; i < report.groups.length; i++) for (let j = i + 1; j < report.groups.length; j++) { const a = report.groups[i].box, b = report.groups[j].box; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) report.warnings.push('groups ' + report.groups[i].name + ' and ' + report.groups[j].name + ' overlap'); }

  for (const s of scrims) layers.push({ type: 'div', props: { style: { position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h, backgroundImage: s.bg } } });
  for (const B of blocks) {
    let y = B.y;
    for (const l of B.laid) {
      const it = l.it; const lx = B.align === 'left' ? B.x0 : B.align === 'right' ? B.x1 - l.w : (B.x0 + B.x1 - l.w) / 2;
      const base = { position: 'absolute', fontFamily: l.font + ', ' + l.font + ' X', fontWeight: l.weight, fontStyle: l.style, fontSize: l.size, letterSpacing: l.track * l.size, lineHeight: 1, color: it.color || B.ink, whiteSpace: 'nowrap' };
      if (l._row) { /* placed with the price */ continue; }
      if (it.role === 'rule') { const rx = B.align === 'center' ? (B.x0 + B.x1 - l.w) / 2 : B.align === 'right' ? B.x1 - l.w : B.x0; layers.push({ type: 'div', props: { style: { position: 'absolute', left: rx, top: y, width: l.w, height: l.h, backgroundColor: it.color || P.accent } } }); y += l.h + l.gap; continue; }
      if (it.role === 'proof') { const col = it.color || B.ink; let px = lx; let py = y; const rowX = (k) => it._stack ? (B.align === 'right' ? B.x1 - it._iw[k] : B.align === 'center' ? (B.x0 + B.x1 - it._iw[k]) / 2 : B.x0) : px;
        l.lines.forEach((t, k) => { const tw = textWidth(t, l.font, l.size, l.weight, l.style, l.track); const ic = l.size * 1.05;
          const rx = rowX(k); layers.push({ type: 'img', props: { src: CHECK(it.icon_color || P.accent), width: ic, height: ic, style: { position: 'absolute', left: rx, top: py + (l.size * 1.3 - ic) / 2 } } });
          layers.push({ type: 'div', props: { style: Object.assign({}, base, { left: rx + ic + 8 * S, top: py + (l.size * 1.3 - l.size) / 2, color: col }), children: t } });
          if (it._stack) py += l.size * 1.3 + 6 * S; else px += ic + 8 * S + tw + 22 * S; });
        y += l.h + l.gap; continue; }
      const pill = (L, X, Y) => { const t = L.lines[0]; const isCta = L.it.role === 'cta'; const st = L.it.style || (isCta ? 'solid' : 'plain');
        const bg = st === 'solid' || st === 'chip' ? (L.it.bg || P.accent) : 'transparent'; const fg = st === 'solid' || st === 'chip' ? (L.it.fg || P.accent_ink) : (L.it.color || B.ink);
        layers.push({ type: 'div', props: { style: { position: 'absolute', left: X, top: Y, width: L.w, height: L.h, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: isCta ? L.h / 2 : 10 * S, backgroundColor: bg, border: st === 'outline' ? (2 * S) + 'px solid ' + fg : 'none',
          fontFamily: L.font + ', ' + L.font + ' X', fontWeight: L.weight, fontSize: L.size, letterSpacing: L.track * L.size, color: fg, lineHeight: 1 }, children: t } }); };
      if (it.role === 'cta' || (it.role === 'price' && it.style && it.style !== 'plain')) { pill(l, lx, y);
        const partner = B.laid.find(q => q._row === l); if (partner) { const cy = y + (l.h - partner.h) / 2; pill(partner, B.align === 'right' ? lx - 28 * S - partner.w : lx + l.w + 28 * S, cy); }
        y += Math.max(l.h, partner ? partner.h : 0) + l.gap; continue; }
      l.lines.forEach((t, k) => { const tw = textWidth(t, l.font, l.size, l.weight, l.style, l.track); const tx = B.align === 'left' ? B.x0 : B.align === 'right' ? B.x1 - tw : (B.x0 + B.x1 - tw) / 2;
        layers.push({ type: 'div', props: { style: Object.assign({}, base, { left: tx, top: y + k * l.size * l.R.lh + (l.size * l.R.lh - l.size) / 2 }), children: t } }); });
      const partner = B.laid.find(q => q._row === l);
      if (partner) { const tw = l.w; const px = B.align === 'right' ? B.x1 - tw - 28 * S - partner.w : lx + tw + 28 * S; pill(partner, px, y + (l.h - partner.h) / 2); y += Math.max(l.h, partner.h) + l.gap; }
      else y += l.h + l.gap;
    }
  }
  // logo: light or dark version by the ground under it
  if (spec.logo && (spec.logo.light || spec.logo.dark)) {
    const lw = (spec.logo.width || 190) * S, lh = (spec.logo.height || 84) * S; const pos = spec.logo.position || 'top-right';
    const lx = pos.indexOf('right') !== -1 ? W - MARGIN - lw : pos.indexOf('center') !== -1 ? (W - lw) / 2 : MARGIN; const ly = pos.indexOf('bottom') !== -1 ? H - MARGIN - lh : MARGIN * 0.8;
    const st = img ? regionStats(img, lx, ly, lw, lh, pxScale) : { mean: 0.5 }; for (const s0 of scrims) { const al = alphaAt(s0, lx + lw / 2, ly + lh / 2); if (al > 0) st.mean = st.mean * (1 - al) + s0.L * al; }
    let src = st.mean < 0.35 ? (spec.logo.light || spec.logo.dark) : (spec.logo.dark || spec.logo.light);
    if (spec.logo.tint) src = tintLogo(src, spec.logo.tint === 'auto' ? (st.mean < 0.35 ? (spec.logo.on_dark || P.light) : (spec.logo.on_light || P.dark)) : spec.logo.tint);
    layers.push({ type: 'img', props: { src, width: lw, height: lh, style: { position: 'absolute', left: lx, top: ly, width: lw, height: lh, objectFit: 'contain' } } });
    report.logo = { x: Math.round(lx), y: Math.round(ly), w: Math.round(lw), h: Math.round(lh), ground: st.mean < 0.35 ? 'dark' : 'light' };
    for (const gr of report.groups) { const a = gr.box; if (a.x < lx + lw && lx < a.x + a.w && a.y < ly + lh && ly < a.y + a.h) report.warnings.push('group ' + gr.name + ' collides with the logo'); }
  }
  const svg = await satori({ type: 'div', props: { style: { width: W, height: H, display: 'flex', position: 'relative', backgroundColor: P.dark }, children: layers } }, { width: W, height: H, fonts: loadFonts().satoriFonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  return { png_b64: Buffer.from(png).toString('base64'), report };
}
