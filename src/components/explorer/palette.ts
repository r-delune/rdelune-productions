/* ── Palette Generation ─────────────────────────────────────
   Derives a full colour palette from an album's base_color hex.
   All maths are inline — no external colour libraries needed.
──────────────────────────────────────────────────────────────── */

export interface Palette {
  baseHue: number;                       // 0-360
  bgDark:     [number, number, number];  // deep tinted background
  bgMid:      [number, number, number];  // mid-tone for layering
  accentGlow: [number, number, number];  // primary accent
  accentWarm: [number, number, number];  // hue-shifted accent
  dotColor:   [number, number, number];  // desaturated light tone for dots
  panelBg:    [number, number, number];  // panel backdrop
}

export interface PaletteTransform {
  hueShift?: number;
  saturation?: number;
  brightness?: number;
  contrast?: number;
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/* ── Conversions ───────────────────────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Returns { h: 0-360, s: 0-1, b: 0-1 } */
export function rgbToHsb(r: number, g: number, b: number): { h: number; s: number; b: number } {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r1) h = ((g1 - b1) / d) % 6;
    else if (max === g1) h = (b1 - r1) / d + 2;
    else h = (r1 - g1) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  return { h, s, b: max };
}

/** h: 0-360, s: 0-1, b: 0-1 → [r, g, b] 0-255 */
export function hsbToRgb(h: number, s: number, b: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = b * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = b - c;

  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60)       { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else              { r1 = c; b1 = x; }

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/* ── Palette Generator ─────────────────────────────────────── */

/** Default navy palette — matches the original CANVAS_BG [12, 16, 28] */
const DEFAULT_HUE = 225;

function createPaletteFromHue(hue: number): Palette {
  const resolvedHue = normalizeHue(hue);

  return {
    baseHue: resolvedHue,
    bgDark: hsbToRgb(resolvedHue, 0.38, 0.26),
    bgMid: hsbToRgb(resolvedHue, 0.55, 0.22),
    accentGlow: hsbToRgb(resolvedHue, 0.80, 0.90),
    accentWarm: hsbToRgb(resolvedHue + 55, 0.72, 0.76),
    dotColor: hsbToRgb(resolvedHue, 0.28, 0.92),
    panelBg: hsbToRgb(resolvedHue, 0.30, 0.12),
  };
}

function copyTriplet(target: [number, number, number], source: [number, number, number]): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function applyTripletTransform(
  value: [number, number, number],
  transform: PaletteTransform,
): [number, number, number] {
  const hsb = rgbToHsb(value[0], value[1], value[2]);
  const saturation = clamp01(hsb.s * (transform.saturation ?? 1));
  const brightness = clamp01(hsb.b * (transform.brightness ?? 1));
  const contrast = transform.contrast ?? 1;
  const contrastedBrightness = clamp01(0.5 + (brightness - 0.5) * contrast);
  return hsbToRgb(hsb.h + (transform.hueShift ?? 0), saturation, contrastedBrightness);
}

export function clonePalette(palette: Palette): Palette {
  return {
    baseHue: palette.baseHue,
    bgDark: [...palette.bgDark],
    bgMid: [...palette.bgMid],
    accentGlow: [...palette.accentGlow],
    accentWarm: [...palette.accentWarm],
    dotColor: [...palette.dotColor],
    panelBg: [...palette.panelBg],
  };
}

function rotateHue(rgb: [number, number, number], degrees: number): [number, number, number] {
  const { h, s, b } = rgbToHsb(rgb[0], rgb[1], rgb[2]);
  return hsbToRgb(h + degrees, s, b);
}

export function applyPaletteHueShift(target: Palette, source: Palette, hueShift: number): void {
  target.baseHue = normalizeHue(source.baseHue + hueShift);
  copyTriplet(target.bgDark,     hueShift === 0 ? source.bgDark     : rotateHue(source.bgDark,     hueShift));
  copyTriplet(target.bgMid,      hueShift === 0 ? source.bgMid      : rotateHue(source.bgMid,      hueShift));
  copyTriplet(target.accentGlow, hueShift === 0 ? source.accentGlow : rotateHue(source.accentGlow, hueShift));
  copyTriplet(target.accentWarm, hueShift === 0 ? source.accentWarm : rotateHue(source.accentWarm, hueShift));
  copyTriplet(target.dotColor,   hueShift === 0 ? source.dotColor   : rotateHue(source.dotColor,   hueShift));
  copyTriplet(target.panelBg,    hueShift === 0 ? source.panelBg    : rotateHue(source.panelBg,    hueShift));
}

export function applyPaletteTransform(target: Palette, source: Palette, transform?: PaletteTransform): void {
  if (!transform) {
    copyTriplet(target.bgDark, source.bgDark);
    copyTriplet(target.bgMid, source.bgMid);
    copyTriplet(target.accentGlow, source.accentGlow);
    copyTriplet(target.accentWarm, source.accentWarm);
    copyTriplet(target.dotColor, source.dotColor);
    copyTriplet(target.panelBg, source.panelBg);
    target.baseHue = source.baseHue;
    return;
  }

  target.baseHue = normalizeHue(source.baseHue + (transform.hueShift ?? 0));
  copyTriplet(target.bgDark, applyTripletTransform(source.bgDark, transform));
  copyTriplet(target.bgMid, applyTripletTransform(source.bgMid, transform));
  copyTriplet(target.accentGlow, applyTripletTransform(source.accentGlow, transform));
  copyTriplet(target.accentWarm, applyTripletTransform(source.accentWarm, transform));
  copyTriplet(target.dotColor, applyTripletTransform(source.dotColor, transform));
  copyTriplet(target.panelBg, applyTripletTransform(source.panelBg, transform));
}

export function generatePalette(baseHex: string | null): Palette {
  let hue = DEFAULT_HUE;

  if (baseHex) {
    const [r, g, b] = hexToRgb(baseHex);
    const hsb = rgbToHsb(r, g, b);
    // Only use extracted hue if the colour has enough saturation to be meaningful
    if (hsb.s > 0.05) hue = hsb.h;
  }

  return createPaletteFromHue(hue);
}
