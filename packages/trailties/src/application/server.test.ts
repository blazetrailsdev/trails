import { BroadcastLogger, Logger } from "@blazetrails/activesupport";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Handler } from "@blazetrails/rack";
import { Trails } from "../rails.js";
import { Application } from "../application.js";

vi.mock("../command/actions.js", () => ({ requireApplicationBang: async () => {} }));
vi.mock("@blazetrails/trails-tsc", () => ({ watchViews: async () => ({ close() {} }) }));

const { serverCommand } = await import("../commands/server.js");

describe("ServerTest", () => {
  let app: Application;

  beforeAll(async () => {
    await import("../__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(
      new URL("../__fixtures__/boot-app", import.meta.url).pathname,
    );
    app = await Trails.initialize();
  }, 15_000);

  afterAll(() => {
    vi.restoreAllMocks();
    Trails.application = null;
    Application.appClass = null;
  });

  it("run +server+ blocks after the server starts", async () => {
    const output: string[] = [];
    app.server(() => {
      output.push("Hello world");
    });
    Trails.logger = new BroadcastLogger(new Logger(null));
    vi.spyOn(Trails, "initialize").mockResolvedValue(app);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Handler.Node, "run").mockImplementation((async () => {
      output.push("Listening");
      return { address: () => null };
    }) as never);

    await serverCommand().parseAsync(["-b", "localhost", "-e", "test"], { from: "user" });

    expect(output).toEqual(["Hello world", "Listening"]);
  });
});
