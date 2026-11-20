import { afterEach, describe, expect, it } from "vitest";
import { I18n, Inflections } from "@blazetrails/activesupport";

import { Trailtie } from "../../lib/trailties/i18n.js";

describe("I18n::Railtie.init_fallbacks", () => {
  afterEach(() => {
    I18n.setFallbacks(null);
  });

  it("mixes Backend::Fallbacks into the backend and resolves inflections through its chain", () => {
    const es = Inflections.instance("es");
    Trailtie.initFallbacks({ ca: ["es"] });

    expect(I18n.fallbacks().get("ca")).toEqual(["ca", "es"]);
    expect(Inflections.instanceOrFallback("ca")).toBe(es);
    expect(typeof (I18n.backend() as unknown as { onFallback?: unknown }).onFallback).toBe(
      "function",
    );
  });

  it("validates the fallbacks setting", () => {
    expect(Trailtie.validateFallbacks(true)).toBe(true);
    expect(() => Trailtie.validateFallbacks("en")).toThrow('Unexpected fallback type "en"');
  });
});
