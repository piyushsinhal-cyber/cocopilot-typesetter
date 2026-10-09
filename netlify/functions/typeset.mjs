// POST /typeset  - body: the layout spec (see README). Header x-typeset-key must match env TYPESET_KEY.
import { typeset } from '../../engine.mjs';
export default async (req) => {
  if (req.method !== 'POST') return new Response('POST a layout spec to /typeset', { status: 405 });
  const key = process.env.TYPESET_KEY;
  if (key && req.headers.get('x-typeset-key') !== key) return new Response('forbidden', { status: 403 });
  let spec; try { spec = await req.json(); } catch (e) { return Response.json({ error: 'body must be JSON' }, { status: 400 }); }
  try { const t0 = Date.now(); const out = await typeset(spec); out.ms = Date.now() - t0; return Response.json(out); }
  catch (e) { return Response.json({ error: String((e && e.message) || e) }, { status: 500 }); }
};
export const config = { path: '/typeset' };
