import { describe, it, expect } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { Metal } from "../metal.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";

const CHROME_118 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36";

describe("AllowBrowser default block", () => {
  it("renders public/406-unsupported-browser.html with 406 Not Acceptable", async () => {
    class ModernController extends Base {
      async hello(): Promise<void> {
        this.head(200);
      }
    }
    ModernController.allowBrowser({ versions: "modern" });

    const fixtures = `${File.dirname(new URL(import.meta.url).pathname)}/../../test-helpers/fixtures`;
    const trails = TopLevel.Trails;
    TopLevel.Trails = { root: () => fixtures } as unknown as typeof trails;
    try {
      const c = new ModernController();
      const request = new Request({
        REQUEST_METHOD: "GET",
        PATH_INFO: "/hello",
        HTTP_HOST: "localhost",
        HTTP_USER_AGENT: CHROME_118,
      });
      await c.dispatch("hello", request, new Response());
      expect(c.status).toBe(406);
      expect(String(c.response.body)).toContain("Your browser is not supported.");
    } finally {
      TopLevel.Trails = trails;
    }
  });
});

describe("Metal.middlewareStack inheritance", () => {
  it("use on a subclass that never read its stack does not reach the superclass", () => {
    class ParentController extends Metal {}
    class ChildController extends ParentController {}
    ChildController.use(((app: unknown) => app) as never);

    expect(ChildController.middlewareStack.middlewares.length).toBe(1);
    expect(ParentController.middlewareStack.isAny()).toBe(false);
    expect(Metal.middlewareStack.isAny()).toBe(false);
    expect(ChildController.middleware()).toBe(ChildController.middlewareStack);
  });
});
