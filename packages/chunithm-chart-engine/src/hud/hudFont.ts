import type { HudFont } from "./textLayout";

/** Where a font's glyph columns sit in the scene bytes, and the pages its glyphs sample. */
export interface HudFontMeta {
  pixelSize: number;
  ascent: number;
  descent: number;
  count: number;
  offset: number;
  pages: { texture: number; width: number; height: number }[];
}

/** Bytes one glyph takes across the font columns. */
export const HUD_FONT_GLYPH_BYTES = 19;

/**
 * Reads glyph columns laid out back to back from `meta.offset`: codepoints as u32, origin x, origin
 * y and advance as i16, source x, y, width and height as u16, then the page as u8.
 */
export function decodeHudFont(meta: HudFontMeta, bytes: Uint8Array): HudFont {
  const n = meta.count;
  const column = (at: number, size: number) =>
    bytes.slice(meta.offset + at * n, meta.offset + (at + size) * n).buffer;
  return {
    pixelSize: meta.pixelSize,
    ascent: meta.ascent,
    descent: meta.descent,
    pages: meta.pages.map(({ width, height }) => ({ width, height })),
    codepoints: new Uint32Array(column(0, 4)),
    originX: new Int16Array(column(4, 2)),
    originY: new Int16Array(column(6, 2)),
    advance: new Int16Array(column(8, 2)),
    sx: new Uint16Array(column(10, 2)),
    sy: new Uint16Array(column(12, 2)),
    sw: new Uint16Array(column(14, 2)),
    sh: new Uint16Array(column(16, 2)),
    page: new Uint8Array(column(18, 1)),
  };
}
