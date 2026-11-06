import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { ActionController } from "@blazetrails/actionpack";
import { FileUtils, TopLevel, constSet, getFs, include } from "@blazetrails/ruby-compat";
import { Application } from "../../application.js";
import { Trails } from "../../trails.js";
import type { Generation } from "../../test-helpers/isolation/abstract-unit.js";
import "../../test-helpers/isolation/abstract-unit.js";

const __FILE__ = import.meta.filename;

interface RackTestMethods {
  get(path: string): Promise<unknown>;
  lastResponse(): { headers: Record<string, string | undefined>; body: string };
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface SendfileTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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

describe("SendfileTest", () => {
  let t: SendfileTest;
  beforeEach(async () => {
    t = new SendfileTest("test");
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

    const rackTest = t as unknown as RackTestMethods;
    await rackTest.get("/");
    expect(rackTest.lastResponse().headers["X-Sendfile"]).toBeFalsy();
    expect(rackTest.lastResponse().body).toBe(await getFs().readFile(__FILE__, "utf-8"));
  });
});
