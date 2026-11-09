import { describe, it, expect, afterEach } from "vitest";
import { Logger } from "@blazetrails/activesupport";
import { SilenceRequest } from "../../lib/rack/silence-request.js";
import { Trails } from "../../lib/trails.js";
import type { RackApp, RackBody } from "@blazetrails/rack";

const emptyBody = (): RackBody => ({
  async *[Symbol.asyncIterator]() {},
});

describe("Rack::SilenceRequest", () => {
  const logger = Trails.logger;

  afterEach(() => {
    Trails.logger = logger;
  });

  it("keeps the logger silenced across the app's await", async () => {
    Trails.logger = new Logger(null);
    Trails.logger.level = Logger.DEBUG;
    let level: number | undefined;

    const app: RackApp = async () => {
      await Promise.resolve();
      level = Trails.logger!.level;
      return [200, {}, emptyBody()];
    };

    await new SilenceRequest(app, { path: "/up" }).call({ PATH_INFO: "/up" });

    expect(level).toBe(Logger.ERROR);
    expect(Trails.logger.level).toBe(Logger.DEBUG);
  });
});
