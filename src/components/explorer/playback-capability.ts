export type ProductionPlaybackMode = 'enhanced-visual-audio' | 'ios-listening';

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export function isAppleTouchClient(): boolean {
  if (typeof window === 'undefined') return false;

  const navigatorWithStandalone = window.navigator as NavigatorWithStandalone;
  const userAgent = navigatorWithStandalone.userAgent.toLowerCase();
  const isTouchMac = navigatorWithStandalone.platform === 'MacIntel'
    && navigatorWithStandalone.maxTouchPoints > 1;

  return /iphone|ipad|ipod/.test(userAgent)
    || isTouchMac
    || navigatorWithStandalone.standalone !== undefined;
}

export function getProductionPlaybackMode(): ProductionPlaybackMode {
  return isAppleTouchClient() ? 'ios-listening' : 'enhanced-visual-audio';
}
