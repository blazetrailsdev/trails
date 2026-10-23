import { beforeEach, describe, it } from "vitest";
import { MissingTemplate } from "@blazetrails/actionview";
import {
  assert,
  assertEqual,
  assertMatch,
  assertNil,
  assertNot,
  assertPredicate,
  assertRaises,
  CurrentAttributes,
  include,
  IsolatedExecutionState,
  Logger,
  Notifications,
} from "@blazetrails/activesupport";
import { Digest } from "@blazetrails/activesupport/digest";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import {
  Concurrent,
  STDOUT,
  rbInspect,
  rbObjId,
  rbObjRespondTo,
  RuntimeError,
  StandardError,
  StringIO,
  Thread,
  Timeout,
} from "@blazetrails/ruby-compat";
import "../../test-helpers/abstract-unit.js";
import { controllerConstants } from "../../action-dispatch/http/request.js";
import type { RackBody } from "../../action-dispatch/http/response.js";
import { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { IntegrationTest } from "../../action-dispatch/testing/integration.js";
import { Base } from "../base.js";
import { BadRequest } from "../metal/exceptions.js";
import type { Parameters } from "../metal/strong-parameters.js";
import { Buffer, Live, SSE, type LiveControllerHost } from "../metal/live.js";
import { TestCase, type LiveTestResponse } from "../test-case.js";

describe("SSETest", () => {
  class SSETestController extends Base {
    static {
      include(this, Live);
    }

    basicSse(): void {
      this.response.headers.set("Content-Type", "text/event-stream");
      const sse = new SSE(this.response.stream as Buffer);
      try {
        sse.write('{"name":"John"}');
        sse.write({ name: "Ryan" });
      } finally {
        sse.close();
      }
    }

    sseWithEvent(): void {
      const sse = new SSE(this.response.stream as Buffer, { event: "send-name" });
      try {
        sse.write('{"name":"John"}');
        sse.write({ name: "Ryan" });
      } finally {
        sse.close();
      }
    }

    sseWithRetry(): void {
      const sse = new SSE(this.response.stream as Buffer, { retry: 1000 });
      try {
        sse.write('{"name":"John"}');
        sse.write({ name: "Ryan" }, { retry: 1500 });
      } finally {
        sse.close();
      }
    }

    sseWithId(): void {
      const sse = new SSE(this.response.stream as Buffer);
      try {
        sse.write('{"name":"John"}', { id: 1 });
        sse.write({ name: "Ryan" }, { id: 2 });
      } finally {
        sse.close();
      }
    }

    sseWithMultipleLineMessage(): void {
      const sse = new SSE(this.response.stream as Buffer);
      try {
        sse.write("first line.\nsecond line.");
      } finally {
        sse.close();
      }
    }
  }

  class SSETest extends TestCase {
    static {
      this.tests(SSETestController);
    }

    waitForResponseStreamClose() {
      return this.response.body;
    }
  }

  let tc: SSETest;

  beforeEach(async ({ task }) => {
    tc = new SSETest(task.name);
    await tc.beforeSetup();
  });

  it("basic sse", async () => {
    await tc.get("basicSse");

    tc.waitForResponseStreamClose();
    assertMatch(/data: {"name":"John"}/, tc.response.body);
    assertMatch(/data: {"name":"Ryan"}/, tc.response.body);
  });

  it("sse with event name", async () => {
    await tc.get("sseWithEvent");

    tc.waitForResponseStreamClose();
    assertMatch(/data: {"name":"John"}/, tc.response.body);
    assertMatch(/data: {"name":"Ryan"}/, tc.response.body);
    assertMatch(/event: send-name/, tc.response.body);
  });

  it("sse with retry", async () => {
    await tc.get("sseWithRetry");

    tc.waitForResponseStreamClose();
    const [firstResponse, secondResponse] = tc.response.body.split("\n\n");
    assertMatch(/data: {"name":"John"}/, firstResponse);
    assertMatch(/retry: 1000/, firstResponse);

    assertMatch(/data: {"name":"Ryan"}/, secondResponse);
    assertMatch(/retry: 1500/, secondResponse);
  });

  it("sse with id", async () => {
    await tc.get("sseWithId");

    tc.waitForResponseStreamClose();
    const [firstResponse, secondResponse] = tc.response.body.split("\n\n");
    assertMatch(/data: {"name":"John"}/, firstResponse);
    assertMatch(/id: 1/, firstResponse);

    assertMatch(/data: {"name":"Ryan"}/, secondResponse);
    assertMatch(/id: 2/, secondResponse);
  });

  it("sse with multiple line message", async () => {
    await tc.get("sseWithMultipleLineMessage");

    tc.waitForResponseStreamClose();
    const [firstResponse, secondResponse] = tc.response.body.split("\n");
    assertMatch(/data: first line/, firstResponse);
    assertMatch(/data: second line/, secondResponse);
  });
});

describe("LiveStreamTest", () => {
  class Exception extends StandardError {}

  class CurrentState extends CurrentAttributes {
    static {
      this.attribute("id");
    }
    declare static id: string | null | undefined;
  }

  class TestController extends Base {
    static {
      include(this, Live);
    }

    declare latch: InstanceType<typeof Concurrent.CountDownLatch>;
    declare tc: LiveStreamTest;
    declare logger: Logger;
    declare errorLatch: InstanceType<typeof Concurrent.CountDownLatch>;

    override get response(): LiveTestResponse {
      return super.response as LiveTestResponse;
    }
    override set response(response: LiveTestResponse) {
      super.response = response;
    }

    declare sendStream: OmitThisParameter<typeof import("../metal/live.js").sendStream>;

    static override controllerPath(): string {
      return "test";
    }

    setCookie(): void {
      this.cookies().set("hello", "world");
      (this.response.stream as Buffer).write("hello world");
      this.response.close();
    }

    async renderText(): Promise<void> {
      await this.render({ plain: "zomg" });
    }

    writeLines(): void {
      (this.response.stream as Buffer).writeln("hello\n");
      (this.response.stream as Buffer).writeln("world");
      (this.response.stream as Buffer).close();
    }

    defaultHeader(): void {
      (this.response.stream as Buffer).write("<html><body>hi</body></html>");
      (this.response.stream as Buffer).close();
    }

    basicStream(): void {
      this.response.headers.set("Content-Type", "text/event-stream");
      for (const word of ["hello", "world"]) {
        (this.response.stream as Buffer).write(word);
      }
      (this.response.stream as Buffer).close();
    }

    async basicSendStream(): Promise<void> {
      await this.sendStream({ filename: "my.csv" }, (stream) => {
        stream.write("name,age\ndavid,41");
      });
    }

    async sendStreamWithOptions(): Promise<void> {
      await this.sendStream(
        { filename: "export", disposition: "inline", type: ":json" },
        (stream) => {
          stream.write('{ name: "David", age: 41 }');
        },
      );
    }

    async sendStreamWithInferredContentType(): Promise<void> {
      await this.sendStream({ filename: "sample.csv" }, (stream) => {
        stream.writeln("fruit,quantity");
        stream.writeln("apple,5");
      });
    }

    async sendStreamWithImplicitContentType(): Promise<void> {
      await this.sendStream({ filename: "sample.csv", type: ":csv" }, (stream) => {
        stream.writeln("fruit,quantity");
        stream.writeln("apple,5");
      });
    }

    async sendStreamWithExplicitContentType(): Promise<void> {
      await this.sendStream({ filename: "sample.csv", type: "text/csv" }, (stream) => {
        stream.writeln("fruit,quantity");
        stream.writeln("apple,5");
      });
    }

    async blockingStream(): Promise<void> {
      this.response.headers.set("Content-Type", "text/event-stream");
      for (const word of ["hello", "world"]) {
        (this.response.stream as Buffer).write(word);
        await this.latch.wait();
      }
      (this.response.stream as Buffer).close();
    }

    threadLocals(): void {
      assertEqual("aaron", Thread.current().get("setting"));

      this.response.headers.set("Content-Type", "text/event-stream");
      for (const word of ["hello", "world"]) {
        (this.response.stream as Buffer).write(word);
      }
      (this.response.stream as Buffer).close();
    }

    noThreadLocals(): void {
      assertNil(Thread.current().get("setting"));

      this.response.headers.set("Content-Type", "text/event-stream");
      for (const word of ["hello", "world"]) {
        (this.response.stream as Buffer).write(word);
      }
      (this.response.stream as Buffer).close();
    }

    async isolatedState(): Promise<void> {
      await this.render({ plain: rbInspect(CurrentState.id) });
    }

    async rawIsolatedState(): Promise<void> {
      await this.render({ plain: rbInspect(IsolatedExecutionState.get("raw_isolated_state")) });
    }

    async withStale(): Promise<void> {
      if (await this.isStale(null, { etag: "123", template: false })) {
        await this.render({ plain: "stale" });
      }
    }

    async exceptionInView(): Promise<void> {
      await this.render("doesntexist");
    }

    async exceptionInViewAfterCommit(): Promise<void> {
      (this.response.stream as Buffer).write("");
      await this.render("doesntexist");
    }

    exceptionWithCallback(): void {
      this.response.headers.set("Content-Type", "text/event-stream");

      (this.response.stream as Buffer).onError(() => {
        (this.response.stream as Buffer).write('data: "500 Internal Server Error"\n\n');
        (this.response.stream as Buffer).close();
      });

      (this.response.stream as Buffer).write("");
      throw new RuntimeError("An exception occurred...");
    }

    exceptionInController(): void {
      throw new Exception("Exception in controller");
    }

    badRequestError(): void {
      throw new BadRequest();
    }

    exceptionInExceptionCallback(): void {
      this.response.headers.set("Content-Type", "text/event-stream");
      (this.response.stream as Buffer).onError(() => {
        throw new RuntimeError("We need to go deeper.");
      });
      (this.response.stream as Buffer).write("");
      (this.response.stream as Buffer).write(
        (this.params.get("widget") as Parameters).get("didnt_check_for_nil") as string,
      );
    }

    overfillBufferAndDie(): void {
      const logger = Base.logger || new Logger(STDOUT);
      (this.response.stream as Buffer).onError(() => {
        logger.warn("Error while streaming.");
        this.errorLatch.countDown();
      });

      for (let i = 0; i < 10; i++) {
        (this.response.stream as Buffer).write(".");
      }
      (this.response.stream as Buffer).write(".");

      this.latch.countDown();

      (this.response.stream as Buffer).write("x");

      for (let i = 0; i < 20; i++) {
        (this.response.stream as Buffer).write(".");
      }
    }

    overfillDefaultBuffer(): void {
      for (const char of "abcdefghijklmnopqrstuvwxyz") {
        (this.response.stream as Buffer).write(char);
      }
      (this.response.stream as Buffer).close();
    }

    ignoreClientDisconnect(): void {
      (this.response.stream as Buffer).ignoreDisconnect = true;

      (this.response.stream as Buffer).write("");

      for (let i = 0; i < 15; i++) {
        (this.response.stream as Buffer).write("x");
      }

      this.logger.info("Work complete");
      this.latch.countDown();
    }
  }

  class LiveStreamTest extends TestCase {
    declare controller: TestController;
    declare response: LiveTestResponse;

    static {
      this.tests(TestController);
    }

    async captureLogOutput(block: (output: StringIO) => Promise<void>): Promise<void> {
      const output = new StringIO();
      const oldLogger = Base.logger;
      Base.logger = new Logger(output);

      try {
        await block(output);
      } finally {
        Base.logger = oldLogger;
      }
    }

    override setup() {
      super.setup();

      const controller = this.controller as unknown as LiveControllerHost & {
        originalNewControllerThread: LiveControllerHost["newControllerThread"];
        originalCleanUpThreadLocals: LiveControllerHost["cleanUpThreadLocals"];
      };
      controller.newControllerThread = function (block) {
        return this.originalNewControllerThread(block);
      };
      controller.cleanUpThreadLocals = function (...args) {
        return this.originalCleanUpThreadLocals(...args);
      };
    }
  }

  let tc: LiveStreamTest;
  const assertStreamClosed = (): void => {
    assertPredicate(tc.response.stream as Buffer, (s) => s.isClosed, "stream should be closed");
    assertPredicate(tc.response, (r) => r.committed, "response should be committed");
    assertPredicate(tc.response, (r) => r.isSent, "response should be sent");
  };

  beforeEach(async ({ task }) => {
    tc = new LiveStreamTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("set cookie", async () => {
    await tc.get("setCookie");
    assertEqual({ hello: "world" }, tc.response.cookies);
    assertEqual("hello world", tc.response.body);
  });

  it("write to stream", async () => {
    await tc.get("basicStream");
    assertEqual("helloworld", tc.response.body);
    assertEqual("text/event-stream", tc.response.headers.get("Content-Type"));
  });

  it("write lines to stream", async () => {
    await tc.get("writeLines");
    assertEqual("hello\nworld\n", tc.response.body);
  });

  it("send stream", async () => {
    await tc.get("basicSendStream");
    assertEqual("name,age\ndavid,41", tc.response.body);
    assertEqual("text/csv", tc.response.headers.get("Content-Type"));
    assertMatch("attachment", tc.response.headers.get("Content-Disposition")!);
    assertMatch("my.csv", tc.response.headers.get("Content-Disposition")!);
  });

  it("send stream instrumentation", async () => {
    let payload: Record<string, unknown> | null = null;
    const subscriber = (event: { payload: Record<string, unknown> }) => {
      payload = event.payload;
    };

    await Notifications.subscribed(subscriber, "send_stream.action_controller", async () => {
      await tc.get("sendStreamWithExplicitContentType");
    });

    assertEqual("sample.csv", payload!["filename"]);
    assertEqual("attachment", payload!["disposition"]);
    assertEqual("text/csv", payload!["type"]);
  });

  it("send stream with options", async () => {
    await tc.get("sendStreamWithOptions");
    assertEqual('{ name: "David", age: 41 }', tc.response.body);
    assertEqual("application/json", tc.response.headers.get("Content-Type"));
    assertMatch("inline", tc.response.headers.get("Content-Disposition")!);
    assertMatch("export", tc.response.headers.get("Content-Disposition")!);
  });

  it("send stream with explicit content type", async () => {
    await tc.get("sendStreamWithExplicitContentType");

    assertEqual("fruit,quantity\napple,5\n", tc.response.body);

    const contentType = tc.response.headers.fetch("Content-Type");
    assertEqual("string", typeof contentType);
    assertEqual("text/csv", contentType);
  });

  it("send stream with implicit content type", async () => {
    await tc.get("sendStreamWithImplicitContentType");

    assertEqual("fruit,quantity\napple,5\n", tc.response.body);

    const contentType = tc.response.headers.fetch("Content-Type");
    assertEqual("string", typeof contentType);
    assertEqual("text/csv", contentType);
  });

  it("send stream with inferred content type", async () => {
    await tc.get("sendStreamWithInferredContentType");

    assertEqual("fruit,quantity\napple,5\n", tc.response.body);

    const contentType = tc.response.headers.fetch("Content-Type");
    assertEqual("string", typeof contentType);
    assertEqual("text/csv", contentType);
  });

  it.skip("delayed autoload after write within interlock hook", () => {
    // PERMANENT-SKIP: the action autoloads `::LoadMe` through a `Zeitwerk` loader while holding `ActiveSupport::Dependencies.interlock`; trails has no autoloader (packages/trailties/CLAUDE.md, "Trails has no autoloader (`Rails.autoloaders` / Zeitwerk)") and so no load interlock to deadlock against.
  });

  it("async stream", async () => {
    tc.controller.latch = new Concurrent.CountDownLatch();
    const parts = ["hello", "world"];

    await tc.get("blockingStream");

    const t = new Thread(async () => {
      const resp = tc.response;
      await resp.awaitCommit();
      for await (const part of resp.stream as Buffer) {
        assertEqual(parts.shift(), part);
        const ol = tc.controller.latch;
        tc.controller.latch = new Concurrent.CountDownLatch();
        ol.countDown();
      }
    });

    assert(await t.join(3), "timeout expired before the thread terminated");
  });

  it("infinite test buffer", async () => {
    await tc.get("overfillDefaultBuffer");
    assertEqual("abcdefghijklmnopqrstuvwxyz", (tc.response.stream as Buffer).body);
  });

  // BLOCKED: live-buffer-write-does-not-wait-on-a-full-queue
  it.skip("abort with full buffer", async () => {
    const oldQueueSize = Buffer.queueSize;
    Buffer.queueSize = 10;

    tc.controller.latch = new Concurrent.CountDownLatch();
    tc.controller.errorLatch = new Concurrent.CountDownLatch();

    try {
      await tc.captureLogOutput(async (output) => {
        await tc.get("overfillBufferAndDie", { format: "plain" });

        const t = new Thread(async () => {
          const resp = tc.response;
          await resp.awaitCommit();
          const [, , body] = resp.toA() as [number, unknown, RackBody];
          for await (const _ of body) {
            await tc.controller.latch.wait();
            body.close();
            break;
          }
        });

        await t.join();
        await tc.controller.errorLatch.wait();
        output.rewind();
        assertMatch("Error while streaming", output.read());
      });
    } finally {
      Buffer.queueSize = oldQueueSize;
    }
  });

  it("ignore client disconnect", async () => {
    tc.controller.latch = new Concurrent.CountDownLatch();

    await tc.captureLogOutput(async (output) => {
      await tc.get("ignoreClientDisconnect");

      const t = new Thread(async () => {
        const resp = tc.response;
        await resp.awaitCommit();
        const [, , body] = resp.toA() as [number, unknown, RackBody];
        for await (const _ of body) {
          body.close();
          break;
        }
      });

      await t.join();
      await Timeout.timeout(3, null, null, async () => {
        await tc.controller.latch.wait();
      });
      output.rewind();
      assertMatch("Work complete", output.read());
    });
  });

  it("thread locals get copied", async () => {
    tc.controller.tc = tc;
    Thread.current().set("originating_thread", rbObjId(Thread.current()));
    Thread.current().set("setting", "aaron");

    await tc.get("threadLocals");
  });

  it("isolated state get copied", async () => {
    tc.controller.tc = tc;
    CurrentState.id = "isolated_state";

    await tc.get("isolatedState");
    assertEqual(rbInspect("isolated_state"), tc.response.body);
    assertStreamClosed();
  });

  it("thread locals get reset", async () => {
    tc.controller.tc = tc;

    Thread.current().set("originating_thread", rbObjId(Thread.current()));
    Thread.current().set("setting", "aaron");

    await tc.get("threadLocals");

    Thread.current().set("setting", null);

    await tc.get("noThreadLocals");
  });

  it("isolated state get reset", async () => {
    tc.controller.tc = tc;
    IsolatedExecutionState.set("raw_isolated_state", "buffy");

    await tc.get("rawIsolatedState");
    assertEqual(rbInspect("buffy"), tc.response.body);
    assertStreamClosed();

    IsolatedExecutionState.clear();

    await tc.get("isolatedState");
    assertEqual(rbInspect(null), tc.response.body);
    assertStreamClosed();
  });

  it("live stream default header", async () => {
    await tc.get("defaultHeader");
    assert(tc.response.headers.get("Content-Type"));
  });

  it("render text", async () => {
    await tc.get("renderText");
    assertEqual("zomg", tc.response.body);
    assertStreamClosed();
  });

  it("exception handling html", async () => {
    await assertRaises([MissingTemplate], {}, async () => {
      await tc.get("exceptionInView");
    });

    await tc.captureLogOutput(async (output) => {
      await tc.get("exceptionInViewAfterCommit");
      await (tc.response.stream as Buffer).awaitBody();
      assertMatch(/(window\.location = "\/500\.html"<\/script><\/html>)$/, tc.response.body);
      output.rewind();
      assertMatch("Missing template test/doesntexist", output.read());
      assertStreamClosed();
    });
    assert(tc.response.body);
    assertStreamClosed();
  });

  it("exception handling plain text", async () => {
    await assertRaises([MissingTemplate], {}, async () => {
      await tc.get("exceptionInView", { format: "json" });
    });

    await tc.captureLogOutput(async (output) => {
      await tc.get("exceptionInViewAfterCommit", { format: "json" });
      await (tc.response.stream as Buffer).awaitBody();
      assertEqual("", tc.response.body);
      output.rewind();
      assertMatch("Missing template test/doesntexist", output.read());
      assertStreamClosed();
    });
  });

  it("exception callback when committed", async () => {
    await tc.captureLogOutput(async (output) => {
      await tc.get("exceptionWithCallback", { format: "text/event-stream" });
      await (tc.response.stream as Buffer).awaitBody();

      assertEqual('data: "500 Internal Server Error"\n\n', tc.response.body);
      output.rewind();
      assertMatch("An exception occurred...", output.read());
      assertStreamClosed();
    });
  });

  it("exception in controller before streaming", async () => {
    await assertRaises([Exception], {}, async () => {
      await tc.get("exceptionInController", { format: "text/event-stream" });
    });
  });

  it("bad request in controller before streaming", async () => {
    await assertRaises([BadRequest], {}, async () => {
      await tc.get("badRequestError", { format: "text/event-stream" });
    });
  });

  it("exceptions raised handling exceptions and committed", async () => {
    await tc.captureLogOutput(async (output) => {
      await tc.get("exceptionInExceptionCallback", { format: "text/event-stream" });
      await (tc.response.stream as Buffer).awaitBody();
      assertEqual("", tc.response.body);
      output.rewind();
      assertMatch("We need to go deeper", output.read());
      assertStreamClosed();
    });
  });

  it("stale without etag", async () => {
    await tc.get("withStale");
    assertEqual(200, tc.response.status);
  });

  it("stale with etag", async () => {
    tc.request.setIfNoneMatch(`W/"${Digest.hexdigest("123")}"`);
    await tc.get("withStale");
    assertEqual(304, tc.response.status);
  });

  it("response buffer do not respond to to ary", async () => {
    await tc.get("basicStream");
    assertNot(rbObjRespondTo(tc.response.toA().at(-1), "toAry"));
  });
});

describe("LiveControllerThreadTest", () => {
  class TestController extends Base {
    static {
      include(this, Live);
    }

    greet(): void {
      this.response.headers.set("Content-Type", "text/event-stream");
      for (const word of ["hello", "world"]) {
        (this.response.stream as Buffer).write(word);
      }
      (this.response.stream as Buffer).close();
    }
  }

  class LiveControllerThreadTest extends TestCase {
    static {
      this.tests(TestController);
    }
  }

  let tc: LiveControllerThreadTest;

  beforeEach(async ({ task }) => {
    tc = new LiveControllerThreadTest(task.name);
    await tc.beforeSetup();
  });

  it("thread locals do not get reset in test environment", async () => {
    Thread.current().set("setting", "aaron");

    await tc.get("greet");

    assertEqual("aaron", Thread.current().get("setting"));
  });
});

describe("BufferTest", () => {
  it("nil callback", () => {
    const buf = new Buffer(null);
    assert(buf.callOnError());
  });
});

describe("LiveStreamRouterTest", () => {
  class TestController extends Base {
    static {
      include(this, Live);
    }

    index(): void {
      this.response.headers.set("Content-Type", "text/event-stream");
      const sse = new SSE(this.response.stream as Buffer);
      try {
        sse.write('{"name":"John"}');
        sse.write({ name: "Ryan" });
      } finally {
        sse.close();
      }
    }
  }

  class LiveStreamRouterTest extends IntegrationTest {
    static call(env: RackEnv): Promise<RackResponse> {
      return this.routes.call(env);
    }

    static _routes?: RouteSet;

    static get routes(): RouteSet {
      return (this._routes ??= new RouteSet());
    }

    static {
      controllerConstants.set("live_stream_router_test/test", TestController);
      this.routes.draw(function () {
        this.get("/test", { to: "live_stream_router_test/test#index" });
      });
    }

    override get app(): unknown {
      return this.constructor;
    }
  }

  let t: LiveStreamRouterTest;
  const assertResponse = (type: string): void => t.assertResponse(type);

  beforeEach(({ task }) => {
    t = new LiveStreamRouterTest(task.name);
  });

  it("streaming served through the router", async () => {
    await t.get("/test");

    assertResponse("ok");
    assertMatch(/data: {"name":"John"}/, t.response.body);
    assertMatch(/data: {"name":"Ryan"}/, t.response.body);
  });
});
