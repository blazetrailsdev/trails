import { describe, expect, it } from "vitest";

import { Collector } from "./mime-responds.js";

describe("Collector#isAnyResponse", () => {
  it("is false when the negotiated format has its own handler", () => {
    const collector = new Collector();
    collector.html(() => undefined);
    collector.any(() => undefined);
    collector.negotiateFormat({ format: "html" });

    expect(collector.isAnyResponse()).toBe(false);
  });

  it("is true when only the catch-all handler matches the negotiated format", () => {
    const collector = new Collector();
    collector.json(() => undefined);
    collector.any(() => undefined);
    collector.negotiateFormat({ format: "html" });

    expect(collector.isAnyResponse()).toBe(true);
  });

  it("is false when no catch-all handler is registered", () => {
    const collector = new Collector();
    collector.json(() => undefined);
    collector.negotiateFormat({ format: "html" });

    expect(collector.isAnyResponse()).toBe(false);
  });
});
