import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, Notifications, setTrailsRoot } from "@blazetrails/activesupport";

import { Base } from "./base.js";
import { LookupContext } from "./lookup-context.js";
import { Start } from "./log-subscriber.js";
import { Renderer } from "./renderer/renderer.js";
import type { RenderableTemplate } from "./renderer/abstract-renderer.js";

class MockLogger extends Logger {
  private _logged: Record<string, string[]> = { debug: [], info: [] };

  constructor() {
    super(null);
  }

  logged(level: string): string[] {
    return this._logged[level] ?? [];
  }

  override debug(message?: string | (() => string)): boolean {
    this._logged.debug.push(typeof message === "function" ? message() : (message ?? ""));
    return true;
  }

  override info(message?: string | (() => string)): boolean {
    this._logged.info.push(typeof message === "function" ? message() : (message ?? ""));
    return true;
  }
}

describe("ActionView::LogSubscriber", () => {
  let logger: MockLogger;
  let oldLogger: unknown;

  beforeEach(() => {
    logger = new MockLogger();
    oldLogger = Base.logger;
    Base.logger = logger;
    setTrailsRoot("/srv/app");
  });

  afterEach(() => {
    Base.logger = oldLogger;
    setTrailsRoot(null);
  });

  it("logs one Rendering line and one Rendered line for a template render", async () => {
    const template: RenderableTemplate = {
      identifier: "/srv/app/app/views/test/hello_world.tse",
      format: "html",
      virtualPath: "test/hello_world",
      render: async () => "Hello world",
    };

    await new Renderer(new LookupContext()).render(
      { viewRenderer: { cacheHits: {} } },
      { template },
    );

    expect(logger.logged("debug")).toEqual(["  Rendering test/hello_world.tse"]);
    expect(logger.logged("info")).toHaveLength(1);
    expect(logger.logged("info")[0]).toMatch(
      /^ {2}Rendered test\/hello_world\.tse \(Duration: .*ms \| GC: .*ms\)$/,
    );
  });

  it("logs one Rendering line and one Rendered line, in that order", () => {
    Notifications.instrument(
      "render_template.action_view",
      { identifier: "/srv/app/app/views/test/hello_world.tse", layout: null },
      () => undefined,
    );

    expect(logger.logged("debug")).toHaveLength(1);
    expect(logger.logged("debug")[0]).toMatch(/^ {2}Rendering test\/hello_world\.tse$/);
    expect(logger.logged("info")).toHaveLength(1);
    expect(logger.logged("info")[0]).toMatch(
      /^ {2}Rendered test\/hello_world\.tse \(Duration: .*ms \| GC: .*ms\)$/,
    );
  });

  it("names the layout on both lines when one is rendered", () => {
    Notifications.instrument(
      "render_template.action_view",
      { identifier: "/srv/app/app/views/test/hello_world.tse", layout: "layouts/yield" },
      () => undefined,
    );

    expect(logger.logged("debug")[0]).toMatch(
      /Rendering test\/hello_world\.tse within layouts\/yield/,
    );
    expect(logger.logged("info")[0]).toMatch(
      /Rendered test\/hello_world\.tse within layouts\/yield/,
    );
  });

  it("logs a layout render at info with the `layout` qualifier", () => {
    Notifications.instrument(
      "render_layout.action_view",
      { identifier: "/srv/app/app/views/layouts/yield.tse" },
      () => undefined,
    );

    expect(logger.logged("debug")[0]).toBe("  Rendering layout layouts/yield.tse");
    expect(logger.logged("info")[0]).toMatch(
      /^ {2}Rendered layout layouts\/yield\.tse \(Duration: .*ms \| GC: .*ms\)$/,
    );
  });

  it("appends the cache hit or miss to a partial render", () => {
    Notifications.instrument(
      "render_partial.action_view",
      { identifier: "/srv/app/app/views/test/_customer.tse", cache_hit: ":hit" },
      () => undefined,
    );
    Notifications.instrument(
      "render_partial.action_view",
      { identifier: "/srv/app/app/views/test/_customer.tse", cache_hit: ":miss" },
      () => undefined,
    );

    expect(logger.logged("debug")[0]).toMatch(/Rendered test\/_customer\.tse .* \[cache hit\]$/);
    expect(logger.logged("debug")[1]).toMatch(/Rendered test\/_customer\.tse .* \[cache miss\]$/);
  });

  it("reports the collection count, or the cache hit ratio when the collection was cached", () => {
    Notifications.instrument(
      "render_collection.action_view",
      { identifier: "/srv/app/app/views/test/_customer.tse", count: 2 },
      () => undefined,
    );
    Notifications.instrument(
      "render_collection.action_view",
      { identifier: "/srv/app/app/views/test/_customer.tse", count: 2, cache_hits: 0 },
      () => undefined,
    );

    expect(logger.logged("debug")[0]).toMatch(
      /Rendered collection of test\/_customer\.tse \[2 times\]/,
    );
    expect(logger.logged("debug")[1]).toMatch(
      /Rendered collection of test\/_customer\.tse \[0 \/ 2 cache hits\]/,
    );
  });

  it("falls back to `templates` when a collection render has no identifier", () => {
    Notifications.instrument("render_collection.action_view", { count: 2 }, () => undefined);

    expect(logger.logged("debug")[0]).toMatch(/Rendered collection of templates/);
  });

  it("is silenced when there is no logger, or the logger is not at debug level", () => {
    const start = new Start();
    expect(start.isSilenced("render_template.action_view")).toBe(false);

    Base.logger = null;
    expect(start.isSilenced("render_template.action_view")).toBe(true);

    Notifications.instrument(
      "render_template.action_view",
      { identifier: "/srv/app/app/views/test/hello_world.tse" },
      () => undefined,
    );
    expect(logger.logged("debug")).toEqual([]);
  });
});
