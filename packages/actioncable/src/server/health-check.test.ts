import { Logger } from "@blazetrails/activesupport";
import { CONTENT_TYPE, Lint, MockRequest } from "@blazetrails/rack";
import { toEnum } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import "../index.js";
import { Base } from "./base.js";
import { Configuration } from "./configuration.js";

type RackResponse = [number, Record<string, string>, Iterable<unknown>];

describe("HealthCheckTest", () => {
  let config: Configuration;
  let server: Base;
  let app: Lint;
  let response: RackResponse;

  beforeEach(async () => {
    config = new Configuration();
    config.logger = new Logger(null);
    server = new Base({ config });
    server.config.cable = { adapter: "async" };
    await server.config.loadPubsubAdapter();

    app = new Lint(server as never);
  });

  it("no health check app are mounted by default", async () => {
    await get("/up");
    expect(response[0]).toBe(404);
  });

  it("setting health_check_path mount the configured health check application", async () => {
    server.config.healthCheckPath = "/up";
    await get("/up");

    expect(response[0]).toBe(200);
    expect(await toEnum(response.at(-1) as object).toA()).toEqual([]);
  });

  it("health_check_application_can_be_customized", async () => {
    server.config.healthCheckPath = "/up";
    server.config.healthCheckApplication = healthCheckApplication();
    await get("/up");

    expect(response[0]).toBe(200);
    expect(await toEnum(response.at(-1) as object).toA()).toEqual(["Hello world!"]);
  });

  async function get(_path: string): Promise<void> {
    const env = MockRequest.envFor("/up", { HTTP_HOST: "localhost" });
    response = (await app.call(env)) as RackResponse;
  }

  function healthCheckApplication(): Configuration["healthCheckApplication"] {
    return (_env) => [200, { [CONTENT_TYPE]: "text/html" }, ["Hello world!"]];
  }
});
