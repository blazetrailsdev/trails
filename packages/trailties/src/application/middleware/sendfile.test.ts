import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { ActionController } from "@blazetrails/actionpack";
import { File, FileUtils, TopLevel, constSet, getFs, include } from "@blazetrails/ruby-compat";
import { Application } from "../../application.js";
import { Trails } from "../../trails.js";
import type { Generation, Rack } from "../../test-helpers/isolation/abstract-unit.js";
import "../../test-helpers/isolation/abstract-unit.js";

const __FILE__ = import.meta.filename;

class SendfileTest extends TestCase {
  async simpleController(): Promise<void> {
    class OmgController extends ActionController.Base {
      async index(): Promise<void> {
        await this.sendFile(__FILE__);
      }
    }
    constSet(TopLevel, "OmgController", OmgController);
  }
}
include(SendfileTest, Isolation);

type Host = Omit<Generation, "simpleController"> &
  Omit<Rack, "get"> &
  SendfileTest & {
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { headers: Record<string, string | undefined>; body: string };
  };

describe("SendfileTest", () => {
  let t: Host;
  beforeEach(async () => {
    t = new SendfileTest("test") as unknown as Host;
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("config.action_dispatch.x_sendfile_header defaults to nil", async () => {
    await t.makeBasicApp();
    await t.simpleController();

    await t.get("/");
    expect(t.lastResponse().headers["x-sendfile"]).toBeFalsy();
    expect(t.lastResponse().body).toBe(await getFs().readFile(__FILE__, "utf-8"));
  });

  it("config.action_dispatch.x_sendfile_header can be set", async () => {
    await t.makeBasicApp((app) => {
      app.config.actionDispatch.xSendfileHeader = "X-Sendfile";
    });

    await t.simpleController();

    await t.get("/");
    expect(t.lastResponse().headers["x-sendfile"]).toBe(File.expandPath(__FILE__));
  });

  it("config.action_dispatch.x_sendfile_header is sent to Rack::Sendfile", async () => {
    await t.makeBasicApp((app) => {
      app.config.actionDispatch.xSendfileHeader = "X-Lighttpd-Send-File";
    });

    await t.simpleController();

    await t.get("/");
    expect(t.lastResponse().headers["x-lighttpd-send-file"]).toBe(File.expandPath(__FILE__));
  });

  it("files handled by ActionDispatch::Static are handled by Rack::Sendfile", async () => {
    const trailsRoot = await t.trailsRoot();
    await t.makeBasicApp((app) => {
      app.config.actionDispatch.xSendfileHeader = "X-Sendfile";
      app.config.publicFileServer.enabled = true;
      app
        .instance()
        .paths()
        .add("public", { with: File.join(trailsRoot, "public") });
    });

    await t.appFile("public/foo.txt", "foo");

    await t.get("/foo.txt", {}, { HTTP_X_SENDFILE_TYPE: "X-Sendfile" });
    expect(t.lastResponse().headers["x-sendfile"]).toBe(File.join(trailsRoot, "public/foo.txt"));
  });
});
