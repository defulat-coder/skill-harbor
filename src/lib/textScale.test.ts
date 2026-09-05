import { beforeEach, describe, expect, it } from "vitest";
import { applyTextSize, TEXT_SIZE_SCALE_MAP } from "./textScale";

beforeEach(() => {
  document.documentElement.style.zoom = "";
  document.documentElement.style.removeProperty("--app-scale");
});

describe("applyTextSize", () => {
  it("applies the configured zoom and CSS variable for each size", () => {
    for (const [size, scale] of Object.entries(TEXT_SIZE_SCALE_MAP)) {
      applyTextSize(size);
      expect(document.documentElement.style.zoom).toBe(scale);
      expect(document.documentElement.style.getPropertyValue("--app-scale")).toBe(scale);
    }
  });

  it("falls back to the default scale for unknown sizes", () => {
    applyTextSize("enormous");
    expect(document.documentElement.style.zoom).toBe(TEXT_SIZE_SCALE_MAP.default);
    expect(document.documentElement.style.getPropertyValue("--app-scale")).toBe(TEXT_SIZE_SCALE_MAP.default);
  });
});
