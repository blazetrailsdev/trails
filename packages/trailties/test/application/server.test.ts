import { BroadcastLogger, Logger } from "@blazetrails/activesupport";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { Dir, env, setEnv, StringIO } from "@blazetrails/ruby-compat";
import { Handler } from "@blazetrails/rackup";
import { Builder } from "@blazetrails/rack";
import { Trails } from "../../lib/trails.js";
import { Application } from "../../lib/application.js";
import { assertOutput } from "../support/console-helpers.js";

await Handler.get("node");

vi.mock("../../lib/command/actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/command/actions.js")>()),
  requireApplicationBang: async () => {},
}));
const output = vi.hoisted(() => [] as string[]);

const { ServerCommand } = await import("../../lib/commands/server.js");

describe("ServerTest", () => {
  let app: Application;
  const savedTrailsEnv = env.TRAILS_ENV;

  beforeAll(async () => {
    await import("../fixtures/boot-app/config/application.js");
    Trails.application!.config.setRoot(new URL("../fixtures/boot-app", import.meta.url).pathname);
    app = await Trails.initialize();
  }, 15_000);

  afterAll(() => {
    vi.restoreAllMocks();
    setEnv("TRAILS_ENV", savedTrailsEnv);
    Trails.application = null;
    Application.appClass = null;
  });

  it("run +server+ blocks after the server starts", async () => {
    app.server(() => {
      output.push("Hello world");
    });
    Trails.logger = new BroadcastLogger(new Logger(null)) as unknown as Logger;
    vi.spyOn(Trails, "initialize").mockResolvedValue(app);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Handler.Node, "run").mockImplementation((async () => {
      output.push("Listening");
      return { on() {} };
    }) as never);

    vi.spyOn(Trails, "root").mockReturnValue(Dir.mktmpdir());
    vi.spyOn(Builder, "parseFile").mockImplementation((async () => {
      const app = await Trails.initialize();
      await app.loadServer();
      return app;
    }) as never);
    await ServerCommand.perform("server", ["-b", "localhost"], {});

    const primary = new StringIO(output.join("\n"));
    assertOutput("Hello world", primary, 100);
    assertOutput("Listening", primary, 100);
  });
});
