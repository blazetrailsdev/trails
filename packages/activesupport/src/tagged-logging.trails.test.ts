import { describe, expect, it } from "vitest";
import { Logger } from "./logger.js";
import { BroadcastLogger } from "./broadcast-logger.js";
import { TaggedLogging } from "./tagged-logging.js";

describe("TaggedLogging.new clone", () => {
  it("keeps a BroadcastLogger's method_missing dispatch", () => {
    class CustomLogger extends Logger {
      foo(): string {
        return "foo";
      }
    }
    const broadcast = new BroadcastLogger(new CustomLogger({ write: () => {} }));
    const tagged = TaggedLogging.new(broadcast) as unknown as { foo(): unknown };
    expect(tagged.foo()).toEqual("foo");
  });

  it("keeps the type of the logger it wraps", () => {
    class TestLogger extends Logger {
      messages: string[] = [];
      constructor() {
        super({ write: (s: string) => this.messages.push(s) });
      }
    }
    const tagged = TaggedLogging.new(new TestLogger());
    tagged.tagged("BCX").info("Funky time");
    expect(tagged.messages).toEqual(["[BCX] Funky time\n"]);
  });
});

describe("TaggedLogging#tagged with an async block", () => {
  it("keeps the tags until the block settles", async () => {
    const lines: string[] = [];
    const logger = TaggedLogging.new(new Logger({ write: (s: string) => lines.push(s) }));
    await logger.tagged("BCX", async (l) => {
      await Promise.resolve();
      l.info("Funky time");
    });
    logger.info("after");
    expect(lines).toEqual(["[BCX] Funky time\n", "after\n"]);
  });

  it("pops the tags when the block rejects", async () => {
    const lines: string[] = [];
    const logger = TaggedLogging.new(new Logger({ write: (s: string) => lines.push(s) }));
    const error = new Error("boom");
    await expect(
      logger.tagged("BCX", async () => {
        await Promise.resolve();
        throw error;
      }),
    ).rejects.toBe(error);
    logger.info("after");
    expect(lines).toEqual(["after\n"]);
  });
});
