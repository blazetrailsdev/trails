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
});
