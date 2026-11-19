import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { extend, FileUtils, include } from "@blazetrails/ruby-compat";
import { Methods } from "@blazetrails/rack-test";
import type { Generation, Rack, Reload } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface HelpersPathTest extends Generation, Reload {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class HelpersPathTest extends TestCase {}
include(HelpersPathTest, Isolation);
registerSpecType(/^HelpersPathTest$/, HelpersPathTest);

describe("HelpersPathTest", { timeout: 120_000 }, () => {
  let t: HelpersPathTest;

  beforeEach(async () => {
    t = new HelpersPathTest("test");
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(() => t.teardownApp());

  it("helper :all includes multi-word and namespaced kebab-case helpers", async () => {
    await t.appFile(
      "app/controllers/foo-controller.ts",
      `
        import { ActionController } from "@blazetrails/actionpack";
        export class FooController extends ActionController.Base {
          async index() {
            await this.render({ inline: "<%= fromJustMe() -%> <%= fromSomeThing() %>" });
          }
        }
`,
    );

    await t.appFile(
      "app/helpers/just-me-helper.ts",
      `
        export const JustMeHelper = {
          fromJustMe() {
            return "from_just_me";
          },
        };
`,
    );

    await t.appFile(
      "app/helpers/admin-area/some-thing-helper.ts",
      `
        export const SomeThingHelper = {
          fromSomeThing() {
            return "from_some_thing";
          },
        };
`,
    );

    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.routes().draw(function () {
          this.get("/:controller(/:action)");
        });
`,
    );

    extend(t, Methods);
    await (t as unknown as Rack).app();
    const rack = t as unknown as Omit<Rack, "get"> & {
      get(path: string): Promise<unknown>;
      lastResponse(): { body: string };
    };
    await rack.get("/foo/index");
    expect(rack.lastResponse().body).toBe("from_just_me from_some_thing");
  });
});
