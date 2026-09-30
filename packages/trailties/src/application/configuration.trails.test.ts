import { describe, expect, it } from "vitest";
import { HTML } from "@blazetrails/html-sanitizer";
import { Configuration } from "./configuration.js";

describe("Configuration#loadDefaults 7.1", () => {
  it("assigns action_view and action_text sanitizer_vendor from best_supported_vendor", () => {
    const c = new Configuration();
    c.set("activeRecord", { encryption: {} });
    c.set("actionView", {});
    c.set("actionText", {});

    c.loadDefaults("7.1");

    const bestSupportedVendor = HTML.Sanitizer.bestSupportedVendor();
    expect((c.get("actionView") as Record<string, unknown>).sanitizerVendor).toBe(
      bestSupportedVendor,
    );
    expect((c.get("actionText") as Record<string, unknown>).sanitizerVendor).toBe(
      bestSupportedVendor,
    );
  });

  it("leaves sanitizer_vendor unset before 7.1", () => {
    const c = new Configuration();
    c.set("actionView", {});

    c.loadDefaults("7.0");

    expect(c.get("actionView")).not.toHaveProperty("sanitizerVendor");
  });
});
