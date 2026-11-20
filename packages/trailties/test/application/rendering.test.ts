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

class RenderingTest extends TestCase {}
include(RenderingTest, Isolation);
include(RenderingTest, Methods);
registerSpecType(/^RenderingTest$/, RenderingTest);

describe("RenderingTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new RenderingTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("Unknown format falls back to HTML template", async () => {
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

    await t.appFile("app/views/pages/show.html.tse", "<%= params.get('id') %>\n");

    await t.app("development");

    await t.get("/pages/foo", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(200);

    await t.get("/pages/foo.bar", {}, { HTTPS: "on" });
    expect(t.lastResponse().status).toBe(200);
  });
});
