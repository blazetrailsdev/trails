import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { include } from "@blazetrails/ruby-compat/include";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string): Promise<unknown>;
    lastResponse(): { status: number; headers: Record<string, string | undefined> };
  };

class ContentSecurityPolicyTest extends TestCase {}
include(ContentSecurityPolicyTest, Isolation);
include(ContentSecurityPolicyTest, Methods);
registerSpecType(/^ContentSecurityPolicyTest$/, ContentSecurityPolicyTest);

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

describe("ContentSecurityPolicyTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new ContentSecurityPolicyTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  function assertPolicy(expected: string, { reportOnly = false } = {}): void {
    expect(t.lastResponse().status).toBe(200);

    let expectedHeader: string;
    let unexpectedHeader: string;
    if (reportOnly) {
      expectedHeader = "content-security-policy-report-only";
      unexpectedHeader = "content-security-policy";
    } else {
      expectedHeader = "content-security-policy";
      unexpectedHeader = "content-security-policy-report-only";
    }

    expect(t.lastResponse().headers[unexpectedHeader]).toBeUndefined();
    expect(t.lastResponse().headers[expectedHeader]).toBe(expected);
  }

  const initializer = (body: string) =>
    t.appFile(
      "config/initializers/content-security-policy.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        ${body}
      `,
    );

  it("default content security policy is nil", async () => {
    await t.controller("pages", pagesController());
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    expect(t.lastResponse().headers["content-security-policy"]).toBeUndefined();
  });

  it("empty content security policy is generated", async () => {
    await t.controller("pages", pagesController());
    await initializer(`Trails.application!.config.contentSecurityPolicy((p) => {});`);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy("");
  });

  it("global content security policy in an initializer", async () => {
    await t.controller("pages", pagesController());
    await initializer(`
      Trails.application!.config.contentSecurityPolicy((p) => {
        p.defaultSrc(":self", ":https");
      });
    `);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy("default-src 'self' https:");
  });

  it("global report only content security policy in an initializer", async () => {
    await t.controller("pages", pagesController());
    await initializer(`
      Trails.application!.config.contentSecurityPolicy((p) => {
        p.defaultSrc(":self", ":https");
      });

      Trails.application!.config.contentSecurityPolicyReportOnly = true;
    `);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy("default-src 'self' https:", { reportOnly: true });
  });

  it("global content security policy nonce directives in an initializer", async () => {
    await t.controller("pages", pagesController());
    await initializer(`
      Trails.application!.config.contentSecurityPolicy((p) => {
        p.defaultSrc(":self", ":https");
        p.scriptSrc(":self", ":https");
        p.styleSrc(":self", ":https");
      });

      Trails.application!.config.contentSecurityPolicyNonceGenerator = () => "iyhD0Yc0W+c=";
      Trails.application!.config.contentSecurityPolicyNonceDirectives = ["script-src"];
    `);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy(
      "default-src 'self' https:; script-src 'self' https: 'nonce-iyhD0Yc0W+c='; style-src 'self' https:",
    );
  });

  it("override content security policy in a controller", async () => {
    await t.controller(
      "pages",
      pagesController(`
        static {
          this.contentSecurityPolicy(undefined, undefined, (p) => {
            p.defaultSrc("https://example.com");
          });
        }
      `),
    );
    await initializer(`
      Trails.application!.config.contentSecurityPolicy((p) => {
        p.defaultSrc(":self", ":https");
      });
    `);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy("default-src https://example.com");
  });

  it("override content security policy to report only in a controller", async () => {
    await t.controller(
      "pages",
      pagesController(`
        static {
          this.contentSecurityPolicyReportOnly();
        }
      `),
    );
    await initializer(`
      Trails.application!.config.contentSecurityPolicy((p) => {
        p.defaultSrc(":self", ":https");
      });
    `);
    await t.appFile("config/routes.ts", rootRoutes);

    await t.app("development");

    await t.get("/");
    assertPolicy("default-src 'self' https:", { reportOnly: true });
  });

  it("global content security policy added to rack app", async () => {
    await initializer(`
      Trails.application!.config.contentSecurityPolicy((p) => {
        p.defaultSrc(":self", ":https");
      });
    `);
    await t.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application!.routes().draw(function () {
          const app = (env) => [200, { "Content-Type": "text/html" }, ["<p>Hello, World!</p>"]];

          this.root({ to: app });
        });
      `,
    );

    await t.app("development");

    await t.get("/");
    assertPolicy("default-src 'self' https:");
  });
});
