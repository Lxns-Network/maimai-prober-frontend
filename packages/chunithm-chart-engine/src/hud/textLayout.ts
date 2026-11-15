/** Glyph table of one bitmap font, indexed by ascending codepoint. */
export interface HudFont {
  pixelSize: number;
  ascent: number;
  descent: number;
  pages: readonly { width: number; height: number }[];
  codepoints: Uint32Array;
  originX: Int16Array;
  originY: Int16Array;
  advance: Int16Array;
  sx: Uint16Array;
  sy: Uint16Array;
  sw: Uint16Array;
  sh: Uint16Array;
  /** Page holding each glyph's image, or `HUD_NO_PAGE` for a glyph that only advances. */
  page: Uint8Array;
}

export const HUD_NO_PAGE = 0xff;

/** Box, alignment and scale of a text cast. */
export interface HudTextProfile {
  /** Bits 4 and 8 align horizontally to the center or right; bits 16 and 32 vertically. */
  flags: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  scaleX: number;
  scaleY: number;
}

export interface HudTextGlyph {
  page: number;
  /** Six font-local, Y-down xyz vertices of two triangles. */
  vertices: number[];
  uvs: number[];
}

export type HudTextLayout =
  | {
      status: "ready";
      glyphs: HudTextGlyph[];
      /** Whether the registered layout held, rather than the fitted fallback. */
      registered: boolean;
    }
  | { status: "unsupported"; reason: string };

const NATIVE_TEXT_CAPACITY = 2048;
const RESERVED = "$<>[]{}";

function glyphIndex(font: HudFont, codepoint: number): number {
  let lo = 0;
  let hi = font.codepoints.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (font.codepoints[mid] < codepoint) lo = mid + 1;
    else hi = mid;
  }
  return lo < font.codepoints.length && font.codepoints[lo] === codepoint ? lo : -1;
}

function prepare(font: HudFont, text: string): number[] | string {
  if (/[\r\n]/u.test(text)) return "multiline text";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127 || RESERVED.includes(char))
      return "control, substitution or rich-text token";
  }
  if (text.length >= NATIVE_TEXT_CAPACITY) return "native text buffer capacity";
  const source: number[] = [];
  for (const char of text) {
    const codepoint = char.codePointAt(0)!;
    const index = codepoint > 0xffff ? -1 : glyphIndex(font, codepoint);
    if (index < 0) return `missing glyph U+${codepoint.toString(16).toUpperCase()}`;
    const glyphPage = font.page[index];
    if (glyphPage !== HUD_NO_PAGE) {
      const atlas = font.pages[glyphPage];
      if (
        font.sx[index] < 1 ||
        font.sy[index] < 1 ||
        font.sx[index] + font.sw[index] + 1 > atlas.width ||
        font.sy[index] + font.sh[index] + 1 > atlas.height
      )
        return "glyph crop without its padding texel";
    }
    source.push(index);
  }
  return source;
}

function finishLayout(glyphs: HudTextGlyph[], registered: boolean): HudTextLayout {
  // The native font groups by texture, with a new page inserted before older pages.
  if (registered) {
    const pages: number[] = [];
    for (const glyph of glyphs) if (!pages.includes(glyph.page)) pages.unshift(glyph.page);
    glyphs = pages.flatMap((page) => glyphs.filter((glyph) => glyph.page === page));
  }
  return { status: "ready", glyphs, registered };
}

function layoutLine(
  profile: HudTextProfile,
  font: HudFont,
  source: readonly number[],
  uvBias: number,
  registered: boolean,
): { measuredWidth: number; layout: HudTextLayout } {
  const f = Math.fround;
  const unsupported = (reason: string) => ({
    measuredWidth: 0,
    layout: { status: "unsupported", reason } as const,
  });
  let scaleX = f(profile.scaleX);
  const scaleY = f(profile.scaleY);
  const edge = (index: number) =>
    font.page[index] === HUD_NO_PAGE ? 0 : font.originX[index] + font.sw[index];
  let advance = 0;
  let measuredWidth = 0;
  for (const index of source) {
    measuredWidth = f(advance + f(edge(index) * scaleX));
    advance = f(advance + f(font.advance[index] * scaleX));
  }
  if (measuredWidth > profile.width) {
    if ((profile.flags & 1) !== 0) return unsupported("unscaled overflow/wrapping");
    scaleX = f(f(f(scaleX * f(profile.width)) / measuredWidth) * f(0.999));
  }
  const height = f(font.pixelSize * scaleY);
  if (height > profile.height) return unsupported("line exceeds source height");
  let right = 0;
  advance = 0;
  for (const index of source) {
    right = f(advance + f(edge(index) * scaleX));
    if (right > profile.width) return unsupported("glyph overflow/wrapping");
    advance = f(advance + f(font.advance[index] * scaleX));
  }
  const horizontal = (profile.flags & 12) >>> 2;
  let x =
    horizontal === 1
      ? Math.trunc(f(f(profile.width - right) * 0.5))
      : horizontal === 2
        ? f(profile.width - right)
        : 0;
  const vertical = (profile.flags & 48) >>> 4;
  const baselineOffset =
    vertical === 1
      ? Math.trunc(f(f(profile.height - height) * 0.5))
      : vertical === 2
        ? f(profile.height - height)
        : 0;
  const glyphs: HudTextGlyph[] = [];
  const y = height;
  const effectiveX = f(f(scaleX / f(profile.scaleX)) * f(profile.scaleX));
  for (const index of source) {
    const page = font.page[index];
    if (page !== HUD_NO_PAGE) {
      const atlas = font.pages[page];
      const originX = font.originX[index];
      const originY = font.originY[index];
      const sx = font.sx[index];
      const sy = font.sy[index];
      const sw = font.sw[index];
      const sh = font.sh[index];
      const left = f(f(x + f((originX - 1) * effectiveX)) - f(profile.pivotX));
      const glyphTop = f(y + f((-originY - font.descent + 2) * scaleY));
      const top = f(glyphTop + f(baselineOffset - f(profile.pivotY)));
      const rightEdge = f(
        f(f((sw + 2) * effectiveX) + f(x + f((originX - 1) * effectiveX))) - f(profile.pivotX),
      );
      const bottom = f(f(f((sh + 2) * scaleY) + glyphTop) + f(baselineOffset - f(profile.pivotY)));
      const iw = f(1 / atlas.width);
      const ih = f(1 / atlas.height);
      const u0 = f(f((sx - 1) * iw) + uvBias);
      const v0 = f(f((sy - 1) * ih) + uvBias);
      const u1 = f(f((sx + sw + 1) * iw) + uvBias);
      const v1 = f(f((sy + sh + 1) * ih) + uvBias);
      glyphs.push({
        page,
        vertices: [
          rightEdge,
          top,
          0,
          left,
          top,
          0,
          left,
          bottom,
          0,
          rightEdge,
          bottom,
          0,
          rightEdge,
          top,
          0,
          left,
          bottom,
          0,
        ],
        uvs: [u1, v0, u0, v0, u0, v1, u1, v1, u1, v0, u0, v1],
      });
    }
    x = f(x + f(font.advance[index] * scaleX));
  }
  return { measuredWidth, layout: finishLayout(glyphs, registered) };
}

const REGISTERED_FLAGS = [32, 34];

/**
 * Lays out one line of a text cast. A registered cast keeps its natural width and samples glyph
 * edges unbiased; a line wider than its box falls back to the horizontally fitted layout.
 */
export function layoutHudTextLine(
  profile: HudTextProfile,
  font: HudFont,
  text: string,
  registered: boolean,
): HudTextLayout {
  const source = prepare(font, text);
  if (typeof source === "string") return { status: "unsupported", reason: source };
  if (registered) {
    if (!REGISTERED_FLAGS.includes(profile.flags))
      return { status: "unsupported", reason: "registered title/artist alignment profile" };
    const line = layoutLine(profile, font, source, 0, true);
    if (line.layout.status !== "ready" || line.measuredWidth <= profile.width) return line.layout;
  }
  return layoutLine(profile, font, source, Math.fround(0.00001), false).layout;
}

/**
 * Lays out one line of a monospaced cast that wraps instead of fitting: every glyph takes a cell of
 * `cell` pixels, the line must fit the box width in whole cells, and the line is aligned by its
 * cell width rather than by its last glyph's edge. A line wider than its box would wrap, which is
 * not laid out.
 */
export function layoutHudTagLine(
  profile: HudTextProfile,
  font: HudFont,
  text: string,
  cell: number,
): HudTextLayout {
  const source = prepare(font, text);
  if (typeof source === "string") return { status: "unsupported", reason: source };
  const f = Math.fround;
  const scaleX = f(profile.scaleX);
  const scaleY = f(profile.scaleY);
  let advance = 0;
  for (let i = 0; i < source.length; i++) advance = f(advance + f(cell * scaleX));
  if (advance > profile.width) return { status: "unsupported", reason: "wrapped monospaced line" };
  const height = f(font.pixelSize * scaleY);
  if (height > profile.height)
    return { status: "unsupported", reason: "line exceeds source height" };
  const horizontal = (profile.flags & 12) >>> 2;
  let x =
    horizontal === 1
      ? Math.trunc(f(f(profile.width - advance) * 0.5))
      : horizontal === 2
        ? f(profile.width - advance)
        : 0;
  const vertical = (profile.flags & 48) >>> 4;
  const baselineOffset =
    vertical === 1
      ? Math.trunc(f(f(profile.height - height) * 0.5))
      : vertical === 2
        ? f(profile.height - height)
        : 0;
  const uvBias = f(0.00001);
  const glyphs: HudTextGlyph[] = [];
  for (const index of source) {
    const page = font.page[index];
    if (page !== HUD_NO_PAGE) {
      const atlas = font.pages[page];
      const originX = f(x + f(f(cell - font.advance[index]) * 0.5) * scaleX);
      const glyphTop = f(height + f((-font.originY[index] - font.descent + 2) * scaleY));
      const top = f(glyphTop + f(baselineOffset - f(profile.pivotY)));
      const left = f(f(originX + f((font.originX[index] - 1) * scaleX)) - f(profile.pivotX));
      const rightEdge = f(
        f(f((font.sw[index] + 2) * scaleX) + f(originX + f((font.originX[index] - 1) * scaleX))) -
          f(profile.pivotX),
      );
      const bottom = f(
        f(f((font.sh[index] + 2) * scaleY) + glyphTop) + f(baselineOffset - f(profile.pivotY)),
      );
      const iw = f(1 / atlas.width);
      const ih = f(1 / atlas.height);
      const u0 = f(f((font.sx[index] - 1) * iw) + uvBias);
      const v0 = f(f((font.sy[index] - 1) * ih) + uvBias);
      const u1 = f(f((font.sx[index] + font.sw[index] + 1) * iw) + uvBias);
      const v1 = f(f((font.sy[index] + font.sh[index] + 1) * ih) + uvBias);
      glyphs.push({
        page,
        vertices: [
          rightEdge,
          top,
          0,
          left,
          top,
          0,
          left,
          bottom,
          0,
          rightEdge,
          bottom,
          0,
          rightEdge,
          top,
          0,
          left,
          bottom,
          0,
        ],
        uvs: [u1, v0, u0, v0, u0, v1, u1, v1, u1, v0, u0, v1],
      });
    }
    x = f(x + f(cell * scaleX));
  }
  return finishLayout(glyphs, true);
}
