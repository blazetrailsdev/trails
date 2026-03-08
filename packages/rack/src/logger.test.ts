import { describe, it, expect } from "vitest";
import { Logger } from "./logger.js";
import { MockRequest } from "./mock-request.js";
import type { RackApp } from "./index.js";

describe("Rack::Logger", () => {
  it("conform to Rack::Lint", async () => {
    const app: RackApp = async (env) => {
      const log = env["rack.logger"] as any;
      log.debug("Created logger");
      log.info("Program started");
      log.warn("Nothing to do!");
      return [200, { "content-type": "text/plain" }, (async function* () { yield "Hello, World!"; })()];
    };

    const output: string[] = [];
    const errors = { write(msg: string) { output.push(msg); } };

    const logger = new Logger(app);
    const env = MockRequest.envFor("/");
    env["rack.errors"] = errors;

    await logger.call(env);

    const joined = output.join("");
    expect(joined).toMatch(/INFO -- : Program started/);
    expect(joined).toMatch(/WARN -- : Nothing to do/);
  });
});
