import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { ActionDispatch } from "@blazetrails/actionpack";
import { Methods } from "@blazetrails/rack-test";
import { include } from "@blazetrails/ruby-compat/include";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string): Promise<unknown>;
    lastResponse(): { status: number; headers: Record<string, string | undefined> };
  };

class PermissionsPolicyTest extends TestCase {
  static readonly POLICY = ActionDispatch.Constants.FEATURE_POLICY;
}
include(PermissionsPolicyTest, Isolation);
include(PermissionsPolicyTest, Methods);
registerSpecType(/^PermissionsPolicyTest$/, PermissionsPolicyTest);

const { POLICY } = PermissionsPolicyTest;

const pagesController = (body = "") => `
  import { ApplicationController } from "./application-controller.ts";
  export class PagesController extends ApplicationController {
    ${body}
    async index() {
      await this.render({ html: "<h1>Welcome to Rails!</h1>" });
    }
  }
`;

const rootRoutes = `
  import { Trails } from "@blazetrails/trailties";
  Trails.application!.routes().draw(function () {
    this.root({ to: "pages#index" });
  });
`;

describe("PermissionsPolicyTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new PermissionsPolicyTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  function assertPolicy(expected: string): void {
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().headers[POLICY]).toBe(expected);
  }

  const initializer = (body: string) =>
    t.appFile(
      "config/initializers/permissions-policy.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.config.permissionsPolicy((p) => {
          ${body}
        });
      `,
    );

  it("permissions policy is not enabled by default", async () => {
    await t.controller("pages", pagesController());
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    expect(t.lastResponse().headers[POLICY]).toBeUndefined();
  });

  it("global permissions policy in an initializer", async () => {
    await t.controller("pages", pagesController());
    await initializer(`p.geolocation(":none");`);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy("geolocation 'none'");
  });

  it("override permissions policy using same directive in a controller", async () => {
    await t.controller(
      "pages",
      pagesController(`
        static {
          this.permissionsPolicy(undefined, (p) => {
            p.geolocation("https://example.com");
          });
        }
      `),
    );
    await initializer(`p.geolocation(":none");`);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy("geolocation https://example.com");
  });

  it("override permissions policy by unsetting a directive in a controller", async () => {
    await t.controller(
      "pages",
      pagesController(`
        static {
          this.permissionsPolicy(undefined, (p) => {
            p.geolocation(null);
          });
        }
      `),
    );
    await initializer(`p.geolocation(":none");`);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().headers[POLICY]).toBeUndefined();
  });

  it("override permissions policy using different directives in a controller", async () => {
    await t.controller(
      "pages",
      pagesController(`
        static {
          this.permissionsPolicy(undefined, (p) => {
            p.geolocation(null);
            p.payment("https://secure.example.com");
            p.autoplay(":none");
          });
        }
      `),
    );
    await initializer(`p.geolocation(":none");`);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy("payment https://secure.example.com; autoplay 'none'");
  });

  it("global permissions policy added to rack app", async () => {
    await initializer(`p.payment(":none");`);
    await t.appFile(
      "config/routes.ts",
      `
        import { CONTENT_TYPE } from "@blazetrails/rack";
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          const app = (env) => [200, { [CONTENT_TYPE]: "text/html" }, ["<p>Hello, World!</p>"]];

          this.root({ to: app });
        });
      `,
    );

    await t.app("development");

    await t.get("/");
    assertPolicy("payment 'none'");
  });
});
