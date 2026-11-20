import { afterEach, describe, expect, it } from "vitest";
import { setFallbacks } from "@blazetrails/i18n";

import { Railtie } from "../lib/i18n-railtie.js";
import { Inflections } from "../lib/inflector/inflections.js";
import { I18n } from "../lib/i18n.js";

describe("I18n::Railtie.init_fallbacks", () => {
  afterEach(() => {
    setFallbacks(null);
  });

  it("mixes Backend::Fallbacks into the backend and resolves inflections through its chain", () => {
    const es = Inflections.instance("es");
    Railtie.initFallbacks({ ca: ["es"] });

    expect(I18n.fallbacks().get("ca")).toEqual(["ca", "es"]);
    expect(Inflections.instanceOrFallback("ca")).toBe(es);
    expect(typeof (I18n.backend() as unknown as { onFallback?: unknown }).onFallback).toBe(
      "function",
    );
  });

  it("validates the fallbacks setting", () => {
    expect(Railtie.validateFallbacks(true)).toBe(true);
    expect(() => Railtie.validateFallbacks("en")).toThrow('Unexpected fallback type "en"');
  });
});
