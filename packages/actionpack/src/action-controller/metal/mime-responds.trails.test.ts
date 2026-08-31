import { describe, expect, it } from "vitest";

import { Base } from "../base.js";
import { Request } from "../../action-dispatch/http/request.js";
import { Collector } from "./mime-responds.js";
import { UnknownFormat } from "./exceptions.js";

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

describe("Collector#any", () => {
  it("registers the handler for each named format when given format arguments", () => {
    const collector = new Collector();
    const handler = () => "shared";
    collector.any("xml", "json", handler);

    collector.negotiateFormat({ format: "xml" });
    expect(collector.isAnyResponse()).toBe(false);
    collector.negotiateFormat({ format: "json" });
    expect(collector.isAnyResponse()).toBe(false);
    collector.negotiateFormat({ format: "html" });
    expect(collector.isAnyResponse()).toBe(false);
  });

  it("registers the catch-all when given no format arguments", () => {
    const collector = new Collector();
    collector.any(() => undefined);
    collector.negotiateFormat({ format: "html" });

    expect(collector.isAnyResponse()).toBe(true);
  });

  it("aliases all to any", () => {
    const collector = new Collector();
    collector.all("xml", () => undefined);
    collector.negotiateFormat({ format: "xml" });

    expect(collector.isAnyResponse()).toBe(false);
  });
});

describe("Collector#custom", () => {
  it("keeps the first registration for a format", () => {
    const collector = new Collector();
    collector.html(() => "first");
    collector.any("html", () => "second");

    expect(collector.negotiate({ format: "html" })?.handler()).toBe("first");
  });

  it("keeps the first registration across repeated custom calls", () => {
    const collector = new Collector();
    collector.custom("html", () => "first");
    collector.custom("html", () => "second");

    expect(collector.negotiate({ format: "html" })?.handler()).toBe("first");
  });
});

describe("Collector#initialize", () => {
  it("seeds a response slot for each mime respond_to was called with", () => {
    const collector = new Collector(["xml", "json"]);

    expect(collector.negotiateFormat({ accept: "application/json" })).toBe("json");
    expect(collector.negotiateFormat({ accept: "text/html" })).toBeNull();
  });
});

describe("Base#respondTo", () => {
  function controller(format: string): Base {
    const base = new Base();
    base.request = new Request({ HTTP_ACCEPT: format }) as unknown as Base["request"];
    return base;
  }

  it("raises when given both types and a block", () => {
    expect(() =>
      controller("text/html").respondTo("html", (format) => {
        format.html(() => undefined);
      }),
    ).toThrow("respond_to takes either types or a block, never both");
  });

  it("negotiates a mime passed without a block", () => {
    expect(() => controller("application/json").respondTo("json")).not.toThrow(UnknownFormat);
  });

  it("registers each mime it was called with", () => {
    let called = false;
    controller("application/json").respondTo((format) => {
      format.json(() => {
        called = true;
      });
    });

    expect(called).toBe(true);
  });
});
