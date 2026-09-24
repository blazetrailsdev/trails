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
