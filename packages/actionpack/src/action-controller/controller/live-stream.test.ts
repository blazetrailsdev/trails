import { beforeEach, describe, it } from "vitest";
import { assertEqual, assertMatch, include, Notifications } from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
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
        sse.write('{"name":"John"}', { id: "1" });
        sse.write({ name: "Ryan" }, { id: "2" });
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
  class TestController extends Base {
    static {
      include(this, Live);
    }

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
      this.response.stream.write("hello world");
      this.response.close();
    }

    writeLines(): void {
      this.response.stream.writeln("hello\n");
      this.response.stream.writeln("world");
      this.response.stream.close();
    }

    basicStream(): void {
      this.response.headers.set("Content-Type", "text/event-stream");
      for (const word of ["hello", "world"]) {
        this.response.stream.write(word);
      }
      this.response.stream.close();
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

    overfillDefaultBuffer(): void {
      for (const char of "abcdefghijklmnopqrstuvwxyz") {
        this.response.stream.write(char);
      }
      this.response.stream.close();
    }
  }

  class LiveStreamTest extends TestCase {
    declare controller: TestController;
    declare response: LiveTestResponse;

    static {
      this.tests(TestController);
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

  it("infinite test buffer", async () => {
    await tc.get("overfillDefaultBuffer");
    assertEqual("abcdefghijklmnopqrstuvwxyz", tc.response.stream.body);
  });
});
