import { describe, it, expect } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { Deprecation, DeprecationException } from "./deprecation.js";

describe("Deprecation#allow (trails)", () => {
  it("scopes the allow-list to one logical task", async () => {
    const dep = new Deprecation("2.0", "Test");
    dep.behavior = [];
    dep.disallowedWarnings = ":all";

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inside = new Thread(() =>
      dep.allow(":all", {}, async () => {
        await held;
        dep.warn("allowed inside the block");
      }),
    ).value();

    expect(() => dep.warn("disallowed outside the block")).toThrow(DeprecationException);

    release();
    await inside;
  });
});
