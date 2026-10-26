import { ActionCable } from "@blazetrails/actioncable";
import type { Base as Server } from "@blazetrails/actioncable/server/base";
import { Worker } from "@blazetrails/actioncable/server/worker";
import { OrderedOptions } from "@blazetrails/activesupport";
import { Handler } from "@blazetrails/rack";
import { getFs, getPath, setEnv } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Application } from "../application.js";
import { _resetTrailsEnv } from "../rails.js";
import { Engine } from "./action-cable.js";

let appPath: string;

async function app(): Promise<Application> {
  setEnv("TRAILS_ENV", "test");
  _resetTrailsEnv();
  class A extends Application {}
  Application.register(A, appPath);
  const application = A.instance();
  await application.root();
  application.config.secretKeyBase = "x".repeat(64);
  return application;
}

function welcome(port: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new globalThis.WebSocket(`ws://127.0.0.1:${port}/cable`, ["actioncable-v1-json"]);
    ws.addEventListener("message", (event) => {
      resolve(JSON.parse(event.data as string));
      ws.close();
    });
    ws.addEventListener("error", () => reject(new Error("websocket error")));
  });
}

describe("ActionCable::Engine", () => {
  beforeEach(async () => {
    await getFs().mkdir!(getPath().resolve("tmp"), { recursive: true });
    appPath = await getFs().mkdtemp!(getPath().join(getPath().resolve("tmp"), "action-cable-"));
    await getFs().mkdir!(getPath().join(appPath, "config"), { recursive: true });
    await getFs().writeFile!(getPath().join(appPath, "config.ts"), "");
    await getFs().writeFile!(
      getPath().join(appPath, "config", "cable.ts"),
      `export default { test: { adapter: "async" } };\n`,
    );
  });

  afterEach(async () => {
    await getFs().rm!(appPath, { recursive: true, force: true });
  });

  it("seeds config.action_cable", () => {
    const options = Engine.config.get("actionCable") as OrderedOptions & Record<string, unknown>;
    expect(options).toBeInstanceOf(OrderedOptions);
    expect(options.mountPath).toBe("/cable");
    expect(options.precompileAssets).toBe(true);
  });

  it("is seated on ActionCable", () => {
    expect(ActionCable.Engine).toBe(Engine);
  });

  it("answers a WebSocket upgrade at the mount path with a welcome message", async () => {
    const application = await app();
    (application.config.get("actionCable") as Record<string, unknown>)[
      "disableRequestForgeryProtection"
    ] = true;
    await application.initialize();

    const server = (ActionCable.server() as Server).config;
    expect(server.cable).toEqual({ adapter: "async" });
    expect(server.disableRequestForgeryProtection).toBe(true);

    const http = await Handler.Node.run(application as never, { Host: "127.0.0.1", Port: 0 });
    try {
      const port = (http.address() as { port: number }).port;
      expect(await welcome(port)).toMatchObject({ type: "welcome" });
    } finally {
      await Handler.Node.shutdown();
      await (ActionCable.server() as Server).restart();
    }
  });

  it("does not mount the server when mount_path is nil", async () => {
    const application = await app();
    (application.config.get("actionCable") as Record<string, unknown>).mountPath = null;
    await application.initialize();

    const http = await Handler.Node.run(application as never, { Host: "127.0.0.1", Port: 0 });
    try {
      const port = (http.address() as { port: number }).port;
      await expect(welcome(port)).rejects.toThrow("websocket error");
    } finally {
      await Handler.Node.shutdown();
    }
  });

  it("runs the executor's complete hook after async work finishes", async () => {
    const application = await app();
    await application.initialize();

    const events: string[] = [];
    application.executor.registerHook({
      run: () => void events.push("run"),
      complete: () => void events.push("complete"),
    });

    await new Worker().work(null, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push("work");
    });

    expect(events).toEqual(["run", "work", "complete"]);
  });
});
