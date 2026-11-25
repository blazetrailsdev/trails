import { constSetPath } from "../../../support/const-set-path.js";
import { beforeEach, describe, expect, it } from "vitest";
import { Base as ActionViewBase } from "@blazetrails/actionview";
import { FixtureResolver } from "@blazetrails/actionview/testing/resolvers";
import { Logger } from "@blazetrails/activesupport";
import { assertEqual, assertMatch } from "@blazetrails/activesupport/testing/assertions";
import { MockRequest } from "@blazetrails/rack";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel, rbObjRespondTo, rbProcCall } from "@blazetrails/ruby-compat/object";
import { StringIO } from "@blazetrails/ruby-compat/string-io";
import { Base } from "../../../../lib/action-controller/base.js";
import { Rack } from "../../../support/abstract-unit.js";

constSet(TopLevel, "RenderStreaming", { name: "RenderStreaming" });

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

constSetPath("RenderStreaming::BasicController", BasicController);

class StreamingTest extends Rack.TestCase {}

describe("StreamingTest", () => {
  let t: StreamingTest;
  const assertBody = (body: string): void => t.assertBody(body);
  const assertStatus = (code: number): void => t.assertStatus(code);
  const assertStreamingBang = (
    status: number,
    headers: Record<string, string | undefined>,
    body: unknown,
  ): void => {
    assertEqual(200, status);

    expect(headers["content-length"]).toBeUndefined();

    expect(rbObjRespondTo(body, "toAry")).toBe(false);
  };
  const assertCacheControlBang = (
    value: string = "no-cache",
    { headers = t.headers! }: { headers?: { get(name: string): unknown } } = {},
  ): void => {
    assertEqual(value, headers.get("cache-control"));
  };
  const assertChunks = async (expected: string[], body: unknown): Promise<void> => {
    let index = 0;
    for await (const chunk of body as AsyncIterable<unknown>) {
      assertEqual(expected[index], chunk);
      index += 1;
    }

    assertEqual(expected.length, index);
  };
  const appCall = async (path: string): Promise<[number, Record<string, string>, unknown]> =>
    (await rbProcCall(t.app, MockRequest.envFor(path))) as [
      number,
      Record<string, string>,
      unknown,
    ];

  beforeEach(({ task }) => {
    t = new StreamingTest(task.name);
  });

  it("rendering with streaming enabled at the class level", async () => {
    const [status, headers, body] = await appCall("/render_streaming/basic/helloWorld");
    assertStreamingBang(status, headers, body);
    await assertChunks(["Hello world", ", I'm here!"], body);

    await t.get("/render_streaming/basic/helloWorld");
    assertBody("Hello world, I'm here!");
  });

  it("rendering with streaming given to render", async () => {
    const [status, headers, body] = await appCall("/render_streaming/basic/explicit");
    assertStreamingBang(status, headers, body);
    await assertChunks(["Hello world", ", I'm here!"], body);

    await t.get("/render_streaming/basic/explicit");
    assertBody("Hello world, I'm here!");
    assertCacheControlBang();
  });

  it("rendering with streaming do not override explicit cache control given to render", async () => {
    const [status, headers, body] = await appCall("/render_streaming/basic/explicitCache");
    assertStreamingBang(status, headers, body);
    await assertChunks(["Hello world", ", I'm here!"], body);

    await t.get("/render_streaming/basic/explicitCache");
    assertBody("Hello world, I'm here!");
    assertCacheControlBang("private");
  });

  it("rendering with streaming no layout", async () => {
    const [status, headers, body] = await appCall("/render_streaming/basic/noLayout");
    assertStreamingBang(status, headers, body);
    await assertChunks(["Hello world"], body);

    await t.get("/render_streaming/basic/noLayout");
    assertBody("Hello world");
    assertCacheControlBang();
  });

  it("skip rendering with streaming at render level", async () => {
    const [status, headers, body] = await appCall("/render_streaming/basic/skip");
    assertEqual(200, status);
    await assertChunks(["Hello world, I'm here!"], body);

    await t.get("/render_streaming/basic/skip");
    assertBody("Hello world, I'm here!");
  });

  it("rendering with layout exception", async () => {
    const [status, headers, body] = await appCall("/render_streaming/basic/layoutException");
    assertStreamingBang(status, headers, body);
    await assertChunks(
      ['<body class="', '"><script>window.location = "/500.html"</script></html>'],
      body,
    );

    await t.get("/render_streaming/basic/layoutException");
    assertBody('<body class=""><script>window.location = "/500.html"</script></html>');
    assertCacheControlBang();
  });

  it("rendering with template exception", async () => {
    const [status, headers, body] = await appCall("/render_streaming/basic/templateException");
    assertStreamingBang(status, headers, body);
    await assertChunks(['"><script>window.location = "/500.html"</script></html>'], body);

    await t.get("/render_streaming/basic/templateException");
    assertBody('"><script>window.location = "/500.html"</script></html>');
    assertCacheControlBang();
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
