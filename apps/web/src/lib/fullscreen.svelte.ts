/** The whole app in full screen through the Fullscreen API; in the desktop app that fills the screen with the window. */
class Fullscreen {
  on = $state(false);
  readonly available = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('fullscreenchange', () => { this.on = !!document.fullscreenElement; });
  }

  toggle(): void {
    if (!this.available) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => { /* refused, e.g. not from a user action */ });
  }
}

export const fullscreen = new Fullscreen();
