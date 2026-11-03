import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Lint, MockRequest, ShowExceptions, TempfileReaper } from "@blazetrails/rack";
import { env, Hash, setEnv } from "@blazetrails/ruby-compat";
import { Server } from "./server.js";

describe("Rackup::Server", () => {
  let rackupHandler: string | undefined;
  beforeEach(() => {
    rackupHandler = env["RACKUP_HANDLER"];
    setEnv("RACKUP_HANDLER", "node");
  });
  afterEach(() => {
    setEnv("RACKUP_HANDLER", rackupHandler);
  });

  it("overrides :config if :app is passed in", () => {
    const server = new Server({ app: "FOO" });
    expect(server.app()).toBe("FOO");
  });

  it("Options#parse parses -p and --port options into :Port", async () => {
    expect(await new Server.Options().parseBang(["-p", "1234"])).toEqual({ Port: "1234" });
    expect(await new Server.Options().parseBang(["--port", "1234"])).toEqual({ Port: "1234" });
  });

  it("Options#parse parses -D and --daemonize option into :daemonize", async () => {
    expect(await new Server.Options().parseBang(["-D"])).toEqual({ daemonize: true });
    expect(await new Server.Options().parseBang(["--daemonize"])).toEqual({ daemonize: true });
  });

  it("Options#parse parses --daemonize-noclose option into :daemonize => :noclose", async () => {
    expect(await new Server.Options().parseBang(["--daemonize-noclose"])).toEqual({
      daemonize: "noclose",
    });
    expect(await new Server.Options().parseBang(["-D", "--daemonize-noclose"])).toEqual({
      daemonize: "noclose",
    });
    expect(await new Server.Options().parseBang(["--daemonize-noclose", "-D"])).toEqual({
      daemonize: "noclose",
    });
  });

  it("Options#parse parses --profile option into :profile", async () => {
    expect(await new Server.Options().parseBang(["--profile", "foo"])).toEqual({
      profileFile: "foo",
    });
  });

  it("Options#parse parses --profile-mode option into :profile_mode", async () => {
    expect(await new Server.Options().parseBang(["--profile-mode", "cpu"])).toEqual({
      profileMode: "cpu",
    });
  });

  it("Options#parse parses argument into :config", async () => {
    expect(await new Server.Options().parseBang(["foo"])).toEqual({ config: "foo" });
  });

  it("prefer to use :builder when it is passed in", async () => {
    const server = new Server({
      builder:
        "builder.run(function (env) { return [200, { 'content-type': 'text/plain' }, ['success']]; });",
    });
    expect((await new MockRequest(server.app() as never).get("/")).body.toString()).toEqual(
      "success",
    );
  });

  it("allow subclasses to override middleware", () => {
    const server = class extends Server {
      override middleware() {
        return new Hash<string, never[]>([]);
      }
    };
    expect(server.middleware().get("deployment")).not.toEqual([]);
    expect(new server({ app: "foo" }).middleware().get("deployment")).toEqual([]);
  });

  it("only provide default middleware for development and deployment environments", () => {
    expect([...Server.defaultMiddlewareByEnvironment().keys()].sort()).toEqual([
      "deployment",
      "development",
    ]);
  });

  it("always return an empty array for unknown environments", () => {
    const server = new Server({ app: "foo" });
    expect(server.middleware().get("production")).toEqual([]);
  });

  it("not include Rack::Lint in deployment environment", () => {
    const server = new Server({ app: "foo" });
    expect(server.middleware().get("deployment")!.flat()).not.toContain(Lint);
  });

  it("not include Rack::ShowExceptions in deployment environment", () => {
    const server = new Server({ app: "foo" });
    expect(server.middleware().get("deployment")!.flat()).not.toContain(ShowExceptions);
  });

  it("include Rack::TempfileReaper in deployment environment", () => {
    const server = new Server({ app: "foo" });
    expect(server.middleware().get("deployment")!.flat()).toContain(TempfileReaper);
  });

  it("be quiet if said so", async () => {
    const server = new Server({ app: "FOO", quiet: true });
    expect(await Server.loggingMiddleware()(server)).toBeNull();
  });
});
