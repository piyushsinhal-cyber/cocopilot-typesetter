import { typeset } from './engine.mjs'; import fs from 'fs';
const P = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
const logo = 'data:image/png;base64,' + fs.readFileSync('/home/claude/kal/logo_png_b64.png').toString('base64');
const L = { light: logo, dark: logo, width: 176, height: 89, tint: 'auto', on_dark: '#F3DDB4', on_light: '#5A3719' };
const PAL = { light: '#FBF1E0', dark: '#24150A', accent: '#EBA65C', accent_ink: '#24150A' };
const TRUST = 'Cash on Delivery · Free Delivery';
export const specs = {
 B1: { plate: P('/home/claude/kal/plate1_sunburst_v2.jpg'), type: { display: 'Cormorant Garamond', text: 'Manrope' }, palette: Object.assign({}, PAL, { light: '#F7EEDC' }), logo: Object.assign({}, L, { position: 'top-left' }),
   keep_clear: [ { label: 'the necklace', x_pct: 38, y_pct: 0, w_pct: 60, h_pct: 96 } ],
   groups: [ { name: 'hook', zone: { col: 0, col_end: 5, top_pct: 19, bottom_pct: 60 }, align: 'left', items: [ { role: 'headline', text: '25+ years.\n8,00,000+\nhappy orders.', size: 84, weight: 600, max_lines: 3 }, { role: 'rule', length: 44 }, { role: 'note', text: 'Our long ball mala, gold plated', size: 21, weight: 500 } ] },
     { name: 'buy', zone: { col: 0, col_end: 5, top_pct: 70, bottom_pct: 100 }, align: 'left', valign: 'bottom', items: [ { role: 'price', text: '\u20b9449', gap_after: 18 }, { role: 'cta', text: 'Shop now' }, { role: 'proof', text: TRUST, inline: false } ] } ] },
 B2: { plate: P('/home/claude/kal/plate3_sunburst_v1.jpg'), type: { display: 'Cormorant Garamond', text: 'Manrope' }, palette: Object.assign({}, PAL, { dark: '#3A2414', accent: '#6E1F2B', accent_ink: '#FFF4E6' }), logo: L,
   keep_clear: [ { label: 'the mangalsutra', x_pct: 30, y_pct: 27, w_pct: 33, h_pct: 52 }, { label: 'the bracelet', x_pct: 64, y_pct: 54, w_pct: 26, h_pct: 22 } ],
   groups: [ { name: 'hook', zone: { col: 0, col_end: 9, top_pct: 7, bottom_pct: 27 }, align: 'left', items: [ { role: 'kicker', text: 'For Karwa Chauth', color: '#6E1F2B' }, { role: 'headline', text: 'The gift she\u2019ll wear every day.', size: 66, weight: 600, max_lines: 2 } ] },
     { name: 'buy', zone: { col: 7, col_end: 12, top_pct: 78, bottom_pct: 100 }, align: 'right', valign: 'bottom', price_cta_row: true, items: [ { role: 'product', text: 'Mangalsutra + hand mangalsutra' }, { role: 'price', text: '\u20b9499' }, { role: 'cta', text: 'Shop the set' }, { role: 'proof', text: TRUST } ] } ] },
 B3: { plate: P('/home/claude/kal/plate4_sunburst_v2.jpg'), type: { display: 'Cormorant Garamond', text: 'Manrope' }, palette: Object.assign({}, PAL, { dark: '#1B0F1C' }), logo: Object.assign({}, L, { position: 'top-left' }),
   keep_clear: [ { label: 'the chain', x_pct: 56, y_pct: 0, w_pct: 44, h_pct: 100 } ],
   groups: [ { name: 'hook', zone: { col: 0, col_end: 6, top_pct: 22, bottom_pct: 68 }, align: 'left', valign: 'middle', items: [ { role: 'kicker', text: 'The 30-inch Bahubali chain' }, { role: 'price', text: '\u20b9549', size: 156, weight: 800, gap_after: 10 }, { role: 'subline', text: 'High gold plated.\nThirty inches long.', size: 38, italic: true } ] },
     { name: 'buy', zone: { col: 0, col_end: 6, top_pct: 74, bottom_pct: 100 }, align: 'left', valign: 'bottom', items: [ { role: 'cta', text: 'Shop now' }, { role: 'proof', text: TRUST } ] } ] },
 B4: { plate: P('/home/claude/kal/plate2_sunburst_v2.jpg'), type: { display: 'Cormorant Garamond', text: 'Manrope' }, palette: PAL, logo: Object.assign({}, L, { position: 'top-left' }),
   keep_clear: [ { label: 'the necklace', x_pct: 52, y_pct: 0, w_pct: 46, h_pct: 92 }, { label: 'the diya flames', x_pct: 70, y_pct: 0, w_pct: 30, h_pct: 14 } ],
   groups: [ { name: 'hook', zone: { col: 0, col_end: 6, top_pct: 22, bottom_pct: 64 }, align: 'left', valign: 'middle', items: [ { role: 'kicker', text: 'Ruby floral · Dual layer' }, { role: 'headline', text: 'Two layers. One festive neckline.', size: 78, weight: 600 }, { role: 'rule', length: 44 }, { role: 'product', text: 'Gold Plated · AD Diamonds' } ] },
     { name: 'buy', zone: { col: 0, col_end: 6, top_pct: 70, bottom_pct: 100 }, align: 'left', valign: 'bottom', price_cta_row: true, items: [ { role: 'price', text: '\u20b9599' }, { role: 'cta', text: 'Shop now' }, { role: 'proof', text: TRUST } ] } ] }
};
if (process.argv[2] !== 'noop') for (const [k, s] of Object.entries(specs)) { const out = await typeset(Object.assign({ width: 1080, height: 1080 }, s)); fs.writeFileSync('/home/claude/kal/' + k + '.png', Buffer.from(out.png_b64, 'base64')); console.log(k, JSON.stringify(out.report.groups.map(g => [g.name, g.contrast, g.scrim])), out.report.logo && out.report.logo.ground, out.report.warnings); }
