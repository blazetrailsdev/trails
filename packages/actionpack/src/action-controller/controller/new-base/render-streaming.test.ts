import { beforeEach, describe, it } from "vitest";
import { Base as ActionViewBase, FixtureResolver } from "@blazetrails/actionview";
import { assertEqual, assertMatch, Logger } from "@blazetrails/activesupport";
import { registerConstant, StringIO } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { Rack } from "../../../test-helpers/abstract-unit.js";

registerConstant("RenderStreaming", { name: "RenderStreaming" });

class BasicController extends Base {
  static {
    Object.defineProperty(this, "name", { value: "RenderStreaming::BasicController" });
    this.viewPaths([
      new FixtureResolver({
        "render-streaming/basic/hello-world.html.tse": "Hello world",
        "render-streaming/basic/boom.html.tse":
          "<%= (() => { throw new Error('Ruby was here!') })() %>",
        "layouts/application.html.tse": "<%= yield %>, I'm here!",
        "layouts/boom.html.tse": '<body class="<%= null.invalid() %>"<%= yield %></body>',
      }),
    ]);

    this.layout("application");
  }

  async helloWorld(): Promise<void> {
    await this.render({ stream: true });
  }

  async layoutException(): Promise<void> {
    await this.render({ action: "helloWorld", stream: true, layout: "boom" });
  }

  async templateException(): Promise<void> {
    await this.render({ action: "boom", stream: true });
  }

  async skip(): Promise<void> {
    await this.render({ action: "helloWorld", stream: false });
  }

  async explicit(): Promise<void> {
    await this.render({ action: "helloWorld", stream: true });
  }

  async noLayout(): Promise<void> {
    await this.render({ action: "helloWorld", stream: true, layout: false });
  }

  async explicitCache(): Promise<void> {
    this.headers.set("Cache-Control", "private");
    await this.render({ action: "helloWorld", stream: true });
  }
}

controllerConstants.set("render_streaming/basic", BasicController);

class StreamingTest extends Rack.TestCase {}

describe("StreamingTest", () => {
  let t: StreamingTest;
  const assertBody = (body: string): void => t.assertBody(body);
  const assertStatus = (code: number): void => t.assertStatus(code);
  const assertStreamingBang = (cache: string = "no-cache"): void => {
    assertStatus(200);
    assertEqual(cache, t.headers!.get("cache-control"));
  };

  beforeEach(({ task }) => {
    t = new StreamingTest(task.name);
  });

  it("rendering with streaming enabled at the class level", async () => {
    await t.get("/render_streaming/basic/helloWorld");
    assertBody("Hello world, I'm here!");
    assertStreamingBang();
  });

  it("rendering with streaming given to render", async () => {
    await t.get("/render_streaming/basic/explicit");
    assertBody("Hello world, I'm here!");
    assertStreamingBang();
  });

  it("rendering with streaming do not override explicit cache control given to render", async () => {
    await t.get("/render_streaming/basic/explicitCache");
    assertBody("Hello world, I'm here!");
    assertStreamingBang("private");
  });

  it("rendering with streaming no layout", async () => {
    await t.get("/render_streaming/basic/noLayout");
    assertBody("Hello world");
    assertStreamingBang();
  });

  it("skip rendering with streaming at render level", async () => {
    await t.get("/render_streaming/basic/skip");
    assertBody("Hello world, I'm here!");
  });

  it("rendering with layout exception", async () => {
    await t.get("/render_streaming/basic/layoutException");
    assertBody('<body class=""><script>window.location = "/500.html"</script></html>');
    assertStreamingBang();
  });

  it("rendering with template exception", async () => {
    await t.get("/render_streaming/basic/templateException");
    assertBody('"><script>window.location = "/500.html"</script></html>');
    assertStreamingBang();
  });

  it("rendering with template exception logs the exception", async () => {
    const io = new StringIO();
    const _old = ActionViewBase.logger;
    ActionViewBase.logger = new Logger(io);

    try {
      await t.get("/render_streaming/basic/templateException");
      io.rewind();
      assertMatch("Ruby was here!", io.read());
    } finally {
      ActionViewBase.logger = _old;
    }
  });
});
