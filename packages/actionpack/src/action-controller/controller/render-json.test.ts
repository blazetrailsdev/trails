import { beforeEach, describe, it } from "vitest";
import {
  ActiveSupportJSON,
  assertEqual,
  Logger,
  ToJsonWithActiveSupportEncoder,
} from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";

describe("RenderJsonTest", () => {
  class JsonRenderable {
    asJson(options: { except?: string[] } | null = {}): Record<string, string> {
      const hash: Record<string, string> = { a: "b", c: "d", e: "f" };
      for (const key of options?.except ?? []) delete hash[key];
      return hash;
    }

    toJSON(_options: Record<string, unknown> = {}): unknown {
      return ToJsonWithActiveSupportEncoder.toJSON.call(this, { except: ["c", "e"] });
    }
  }

  class InspectOptions {
    asJson(options: Record<string, unknown> = {}): Record<string, unknown> {
      return { options: options };
    }
  }

  class TestController extends Base {
    static {
      this.protectFromForgery();
    }

    static override controllerPath(): string {
      return "test";
    }

    async renderJsonNil() {
      await this.render({ json: null });
    }

    async renderJsonHelloWorld() {
      await this.render({ json: ActiveSupportJSON.encode({ hello: "world" }) });
    }

    async renderJsonHelloWorldWithStatus() {
      await this.render({ json: ActiveSupportJSON.encode({ hello: "world" }), status: 401 });
    }

    async renderJsonHelloWorldWithCallback() {
      await this.render({ json: ActiveSupportJSON.encode({ hello: "world" }), callback: "alert" });
    }

    async renderJsonWithCustomContentType() {
      await this.render({
        json: ActiveSupportJSON.encode({ hello: "world" }),
        contentType: "text/javascript",
      });
    }

    async renderSymbolJson() {
      await this.render({ json: ActiveSupportJSON.encode({ hello: "world" }) });
    }

    async renderJsonWithRenderToString() {
      await this.render({ json: { hello: await this.renderToString({ partial: "partial" }) } });
    }

    async renderJsonWithExtraOptions() {
      await this.render({ json: new JsonRenderable(), except: ["c", "e"] } as { json: unknown });
    }

    async renderJsonWithoutOptions() {
      await this.render({ json: new JsonRenderable() });
    }

    async renderJsonInspectOptions() {
      await this.render({ json: new InspectOptions() });
    }
  }

  class RenderJsonTest extends TestCase {
    static {
      this.tests(TestController);
    }
  }

  let tc: RenderJsonTest;

  beforeEach(async ({ task }) => {
    tc = new RenderJsonTest(task.name);
    await tc.beforeSetup();
    tc.setup();
    TestController.logger = new Logger(null);

    tc.request.host = "www.nextangle.com";
  });

  it("render json nil", async () => {
    await tc.get("renderJsonNil");
    assertEqual("null", tc.response.body);
    assertEqual("application/json", tc.response.mediaType);
  });

  it("render json", async () => {
    await tc.get("renderJsonHelloWorld");
    assertEqual('{"hello":"world"}', tc.response.body);
    assertEqual("application/json", tc.response.mediaType);
  });

  it("render json with status", async () => {
    await tc.get("renderJsonHelloWorldWithStatus");
    assertEqual('{"hello":"world"}', tc.response.body);
    assertEqual(401, tc.response.status);
  });

  it("render json with callback", async () => {
    await tc.get("renderJsonHelloWorldWithCallback", { xhr: true });
    assertEqual('/**/alert({"hello":"world"})', tc.response.body);
    assertEqual("text/javascript", tc.response.mediaType);
  });

  it("render json with custom content type", async () => {
    await tc.get("renderJsonWithCustomContentType", { xhr: true });
    assertEqual('{"hello":"world"}', tc.response.body);
    assertEqual("text/javascript", tc.response.mediaType);
  });

  it("render symbol json", async () => {
    await tc.get("renderSymbolJson");
    assertEqual('{"hello":"world"}', tc.response.body);
    assertEqual("application/json", tc.response.mediaType);
  });

  it("render json with render to string", async () => {
    await tc.get("renderJsonWithRenderToString");
    assertEqual('{"hello":"partial html"}', tc.response.body);
    assertEqual("application/json", tc.response.mediaType);
  });

  it("render json forwards extra options", async () => {
    await tc.get("renderJsonWithExtraOptions");
    assertEqual('{"a":"b"}', tc.response.body);
    assertEqual("application/json", tc.response.mediaType);
  });

  it("render json calls to json from object", async () => {
    await tc.get("renderJsonWithoutOptions");
    assertEqual('{"a":"b"}', tc.response.body);
  });

  it("render json avoids view options", async () => {
    await tc.get("renderJsonInspectOptions");
    assertEqual('{"options":{}}', tc.response.body);
  });
});
