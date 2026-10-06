import { beforeEach, describe, expect, it } from "vitest";
import { ActiveSupportJSON, withIndifferentAccess } from "@blazetrails/activesupport";
import { Interrupt, StringIO } from "@blazetrails/ruby-compat";
import { IntegrationTest } from "../../action-dispatch/testing/integration.js";
import { Mime } from "../../action-dispatch/http/mime-type.js";
import { controllerConstants, Request } from "../../action-dispatch/http/request.js";
import type { ParameterParser } from "../../action-dispatch/http/parameters.js";
import type { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { Base } from "../base.js";
import { Parameters } from "../metal/strong-parameters.js";
import "../../test-helpers/abstract-unit.js";

class TestController extends Base {
  declare params: Parameters;

  async assignParameters(): Promise<void> {
    if (this.params.get("full") != null) {
      await this.render({ plain: this.dumpParamsKeys() });
    } else {
      await this.render({
        plain: this.params.keys
          .filter((k) => !["controller", "action"].includes(k))
          .sort()
          .join(", "),
      });
    }
  }

  dumpParamsKeys(hash: Parameters | Record<string, unknown> = this.params): string {
    const keys = hash instanceof Parameters ? hash.keys : Object.keys(hash);
    return keys.sort().reduce((s, k) => {
      let value = hash instanceof Parameters ? hash.get(k) : hash[k];

      if (
        (value != null && typeof value === "object" && !Array.isArray(value)) ||
        value instanceof Parameters
      ) {
        value = `(${this.dumpParamsKeys(value as Parameters)})`;
      } else {
        value = "";
      }

      if (s !== "") s += ", ";
      return s + `${k}${value}`;
    }, "");
  }
}

class WebServiceTest extends IntegrationTest {
  static TestController = TestController;

  declare controller: TestController;

  static {
    controllerConstants.set("web_service_test/test", TestController);
  }

  async withParamsParsers(
    parsers: Map<unknown, ParameterParser> = new Map(),
    block: () => Promise<void>,
  ): Promise<void> {
    const oldSession = this._integrationSession;
    const originalParsers = Request.parameterParsers;
    try {
      Request.parameterParsers = new Map<unknown, ParameterParser>([
        ...Object.entries(originalParsers),
        ...parsers,
      ]);
      this.resetBang();
      await block();
    } finally {
      Request.parameterParsers = originalParsers;
      this._integrationSession = oldSession;
    }
  }

  async withTestRouteSet(block: () => Promise<void>): Promise<void> {
    await this.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.match("/", { to: "web_service_test/test#assignParameters", via: ":all" });
      });
      await block();
    });
  }
}

describe("WebServiceTest", () => {
  let t: WebServiceTest;

  beforeEach(({ task }) => {
    t = new WebServiceTest(task.name);
    t.controller = new TestController();
    t._integrationSession = null;
  });

  it("check parameters", async () => {
    await t.withTestRouteSet(async () => {
      await t.get("/");
      expect(t.controller.response.body).toBe("");
    });
  });

  it("post json", async () => {
    await t.withTestRouteSet(async () => {
      await t.post("/", {
        params: '{"entry":{"summary":"content..."}}',
        headers: { CONTENT_TYPE: "application/json" },
      });

      expect(t.controller.response.body).toBe("entry");
      expect(t.controller.params.hasKey("entry")).toBeTruthy();
      expect((t.controller.params.get("entry") as Parameters).get("summary")).toBe("content...");
    });
  });

  it("put json", async () => {
    await t.withTestRouteSet(async () => {
      await t.put("/", {
        params: '{"entry":{"summary":"content..."}}',
        headers: { CONTENT_TYPE: "application/json" },
      });

      expect(t.controller.response.body).toBe("entry");
      expect(t.controller.params.hasKey("entry")).toBeTruthy();
      expect((t.controller.params.get("entry") as Parameters).get("summary")).toBe("content...");
    });
  });

  // BLOCKED: request-params-pipeline-drops-a-hash-with-indifferent-access
  it.skip("register and use json simple", async () => {
    await t.withTestRouteSet(async () => {
      await t.withParamsParsers(
        new Map([
          [
            Mime.get("json"),
            ((data: string) =>
              withIndifferentAccess(
                (ActiveSupportJSON.decode(data) as Record<string, Record<string, unknown>>)[
                  "request"
                ],
              )) as unknown as ParameterParser,
          ],
        ]),
        async () => {
          await t.post("/", {
            params: '{"request":{"summary":"content...","title":"JSON"}}',
            headers: { CONTENT_TYPE: "application/json" },
          });

          expect(t.controller.response.body).toBe("summary, title");
          expect(t.controller.params.hasKey("summary")).toBeTruthy();
          expect(t.controller.params.hasKey("title")).toBeTruthy();
          expect(t.controller.params.get("summary")).toBe("content...");
          expect(t.controller.params.get("title")).toBe("JSON");
        },
      );
    });
  });

  it("use json with empty request", async () => {
    await t.withTestRouteSet(async () => {
      await expect(
        t.post("/", { headers: { CONTENT_TYPE: "application/json" } }),
      ).resolves.not.toThrow();
      expect(t.controller.response.body).toBe("");
    });
  });

  it("dasherized keys as json", async () => {
    await t.withTestRouteSet(async () => {
      await t.post("/?full=1", {
        params: '{"first-key":{"sub-key":"..."}}',
        headers: { CONTENT_TYPE: "application/json" },
      });
      expect(t.controller.response.body).toBe("action, controller, first-key(sub-key), full");
      expect((t.controller.params.get("first-key") as Parameters).get("sub-key")).toBe("...");
    });
  });

  it("parsing json doesnot rescue exception", () => {
    const req = new (class extends Request {
      override paramsParsers(): Record<string, ParameterParser> {
        return {
          ":json": () => {
            throw new Interrupt();
          },
        };
      }

      override get contentLength(): number {
        return (this.getHeader("rack.input") as StringIO).size();
      }
    })({ "rack.input": new StringIO('{"title":"JSON"}}'), CONTENT_TYPE: "application/json" });

    expect(() => req.requestParameters).toThrow(Interrupt);
  });
});
