import { describe, expect, it } from "vitest";
import { HTML } from "@blazetrails/html-sanitizer";
import { Configuration } from "../../lib/application/configuration.js";
import { Custom } from "../../lib/application/configuration.js";

describe("Configuration#loadDefaults 7.1", () => {
  it("assigns action_view and action_text sanitizer_vendor from best_supported_vendor", () => {
    const c = new Configuration("/app");
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
    const c = new Configuration("/app");
    c.set("actionView", {});

    c.loadDefaults("7.0");

    expect(c.get("actionView")).not.toHaveProperty("sanitizerVendor");
  });
});

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    class Sub extends Custom {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const sub = new Sub();
    expect(sub.secret()).toBe(1);
    sub.payment = "stripe";
    expect(sub.payment).toBe("stripe");
    expect("anything" in sub).toBe(true);
    expect(sub instanceof Custom).toBe(true);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});
