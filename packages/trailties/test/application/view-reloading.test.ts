import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { include } from "@blazetrails/ruby-compat";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { status: number; body: string };
  };

class ViewReloadingTest extends TestCase {}
include(ViewReloadingTest, Isolation);
include(ViewReloadingTest, Methods);
registerSpecType(/^ViewReloadingTest$/, ViewReloadingTest);

describe("ViewReloadingTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new ViewReloadingTest("test") as unknown as Host;
    await t.buildApp();

    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          this.get("pages/:id", { to: "pages#show" });
        });
`,
    );

    await t.appFile(
      "app/controllers/pages-controller.ts",
      `
        import { ApplicationController } from "./application-controller.ts";
        export class PagesController extends ApplicationController {
          static {
            this.layout(false);
          }

          show() {}
        }
`,
    );
  });

  afterEach(() => t.teardownApp());

  it("views are reloaded", async () => {
    await t.appFile("app/views/pages/show.html.tse", "Before!\n");

    await t.app("development");

    await t.get("/pages/foo");
    await t.get("/pages/foo");
    expect(t.lastResponse().status, t.lastResponse().body).toBe(200);
    expect(t.lastResponse().body.trim()).toBe("Before!");

    await t.appFile("app/views/pages/show.html.tse", "After!\n");

    await t.get("/pages/foo");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body.trim()).toBe("After!");
  });
});
