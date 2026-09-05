import "@testing-library/jest-dom/vitest";

// jsdom does not implement window.matchMedia; the theme store/effects call it
// at init and on mount. Stub the minimal MediaQueryList surface tests rely on.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
