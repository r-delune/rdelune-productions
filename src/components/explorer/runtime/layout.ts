/* ── Explorer Panel Layout ──────────────────────────────────
   Single source of truth for the player panel footprint.
   The canvas exclusion zone and the player panel should always
   use the same geometry, otherwise the right side can look
   empty, misaligned, or visually dead.
──────────────────────────────────────────────────────────────── */

export const EXPLORER_DESKTOP_BREAKPOINT = 1024;
export const EXPLORER_TABLET_BREAKPOINT = 640;
export const EXPLORER_ALBUM_BROWSER_MIN_WIDTH = 296;
export const EXPLORER_ALBUM_BROWSER_MAX_WIDTH = 344;
export const EXPLORER_ALBUM_BROWSER_WIDTH_RATIO = 0.205;
export const EXPLORER_PANEL_MIN_WIDTH = 280;
export const EXPLORER_PANEL_MAX_WIDTH = 340;
export const EXPLORER_PANEL_TABLET_MAX_WIDTH = 520;
export const EXPLORER_PANEL_WIDTH_RATIO = 0.22;
export const EXPLORER_PANEL_COLLAPSED_WIDTH = 72;
export const EXPLORER_PANEL_SOFT_EDGE = 80;

export const EXPLORER_ALBUM_BROWSER_WIDTH_STYLE = `clamp(${EXPLORER_ALBUM_BROWSER_MIN_WIDTH}px, ${EXPLORER_ALBUM_BROWSER_WIDTH_RATIO * 100}vw, ${EXPLORER_ALBUM_BROWSER_MAX_WIDTH}px)`;
export const EXPLORER_PANEL_WIDTH_STYLE = `clamp(${EXPLORER_PANEL_MIN_WIDTH}px, ${EXPLORER_PANEL_WIDTH_RATIO * 100}vw, ${EXPLORER_PANEL_MAX_WIDTH}px)`;

export interface ExplorerPanelMetrics {
  isMobile: boolean;
  isTablet: boolean;
  width: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ExplorerStageMetrics {
  isMobile: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface ExplorerPanelLayoutOptions {
  collapsed?: boolean;
}

export function getExplorerPanelMetrics(
  viewportWidth: number,
  viewportHeight: number,
  options?: ExplorerPanelLayoutOptions,
): ExplorerPanelMetrics {
  const isMobile = viewportWidth < EXPLORER_DESKTOP_BREAKPOINT;
  const isTablet = viewportWidth >= EXPLORER_TABLET_BREAKPOINT;
  const collapsed = !isMobile && options?.collapsed;
  const width = collapsed
    ? EXPLORER_PANEL_COLLAPSED_WIDTH
    : isMobile
    ? Math.min(viewportWidth - (isTablet ? 48 : 24), EXPLORER_PANEL_TABLET_MAX_WIDTH)
    : Math.min(Math.max(viewportWidth * EXPLORER_PANEL_WIDTH_RATIO, EXPLORER_PANEL_MIN_WIDTH), EXPLORER_PANEL_MAX_WIDTH);
  const left = isMobile ? (viewportWidth - width) * 0.5 : viewportWidth - width;
  const top = isMobile ? 80 : 0;

  return {
    isMobile,
    isTablet,
    width,
    left,
    right: left + width,
    top,
    bottom: viewportHeight,
  };
}

export function getExplorerAlbumBrowserWidth(viewportWidth: number): number {
  if (viewportWidth < EXPLORER_DESKTOP_BREAKPOINT) return 0;

  return Math.min(
    Math.max(viewportWidth * EXPLORER_ALBUM_BROWSER_WIDTH_RATIO, EXPLORER_ALBUM_BROWSER_MIN_WIDTH),
    EXPLORER_ALBUM_BROWSER_MAX_WIDTH,
  );
}

export function getExplorerStageMetrics(
  viewportWidth: number,
  viewportHeight: number,
  options?: ExplorerPanelLayoutOptions,
): ExplorerStageMetrics {
  const panel = getExplorerPanelMetrics(viewportWidth, viewportHeight, options);
  const left = getExplorerAlbumBrowserWidth(viewportWidth);
  const right = viewportWidth;
  const top = 0;
  const bottom = viewportHeight;

  return {
    isMobile: panel.isMobile,
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
