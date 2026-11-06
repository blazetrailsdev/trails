import { BroadcastLogger, Logger } from "@blazetrails/activesupport";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { Dir, env, setEnv, StringIO } from "@blazetrails/ruby-compat";
import { Handler } from "@blazetrails/rackup";
import { Builder } from "@blazetrails/rack";
import { Trails } from "../trails.js";
import { Application } from "../application.js";
import { assertOutput } from "../support/console-helpers.js";

await Handler.get("node");

vi.mock("../command/actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../command/actions.js")>()),
  requireApplicationBang: async () => {},
}));
vi.mock("@blazetrails/trails-tsc", () => ({ watchViews: async () => ({ close() {} }) }));
const output = vi.hoisted(() => [] as string[]);
vi.mock("../server/dev-server.js", async () => {
  const { Handler } = await import("@blazetrails/rackup");
  class DevServer {
    static async run() {
      output.push("Listening");
      return { on() {} };
    }
  }
  Handler.register("vite", DevServer);
  return { DevServer };
});

const { ServerCommand } = await import("../commands/server.js");

describe("ServerTest", () => {
  let app: Application;
  const savedTrailsEnv = env.TRAILS_ENV;

  beforeAll(async () => {
    await import("../__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("../__fixtures__/boot-app", import.meta.url).pathname,
    );
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
    Trails.logger = new BroadcastLogger(new Logger(null));
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
