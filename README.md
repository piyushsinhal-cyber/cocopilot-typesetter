# Cocopilot typesetter
The image model renders the photograph (the plate, no text). This service sets every word on top like a senior designer:
12-column grid, fixed margins, 8 px baseline, role-based type scale, measured balanced line breaks, auto-fit,
contrast measured from the plate's real pixels (directional scrim only when needed), price/CTA pills, trust ticks,
logo picked for its ground. Returns `{ png_b64, report }`; the report (contrast per group, sizes, warnings: overflow,
overlap, logo collision) drives the art-director loop in n8n.

POST /typeset with header `x-typeset-key: <TYPESET_KEY>` and a JSON spec:
`{ width, height, plate: "data:image/jpeg;base64,...", type: { display, text, script }, palette: { light, dark, accent, accent_ink },
  logo: { light, dark, width, height, position }, groups: [ { name, zone: { col, col_end, top_pct, bottom_pct }, align, valign,
  density, price_cta_row, scrim, color, items: [ { role: kicker|headline|subline|product|price|cta|proof|note|script|rule, text, ... } ] } ] }`
Fonts: Playfair Display, Cormorant Garamond, Bodoni Moda, DM Serif Display, Manrope, Inter, Oswald, Great Vibes.
