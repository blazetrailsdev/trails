import { describe, it, expect, beforeEach } from "vitest";
import { Logger } from "./logger.js";
import { BroadcastLogger } from "./broadcast-logger.js";
import { TagStack, TaggedLogging } from "./tagged-logging.js";
import { Thread, extend } from "@blazetrails/ruby-compat";
import { assertRespondTo, assertNotNil, assertNil } from "./testing/assertions.js";

function makeBuffer() {
  const lines: string[] = [];
  return {
    write(s: string) {
      lines.push(s);
    },
    get string(): string {
      return lines.join("");
    },
    lines,
  };
}

describe("TaggedLoggingWithoutBlockTest", () => {
  let output: ReturnType<typeof makeBuffer>;
  let logger: ReturnType<typeof TaggedLogging.new>;
  beforeEach(() => {
    output = makeBuffer();
    const base = new Logger(output);
    logger = TaggedLogging.new(base);
  });

  it("tagged once", () => {
    logger.tagged("BCX").info("Funky time");
    expect(output.string).toBe("[BCX] Funky time\n");
  });

  it("tagged twice", () => {
    logger.tagged("BCX").tagged("Jason").info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] Funky time\n");
  });

  it("tagged thrice at once", () => {
    logger.tagged("BCX", "Jason", "New").info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged are flattened", () => {
    logger.tagged("BCX", ["Jason", "New"]).info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged once with blank and nil", () => {
    logger.tagged(null, "", "New").info("Funky time");
    expect(output.string).toBe("[New] Funky time\n");
  });

  it("mixed levels of tagging", () => {
    const bcx = logger.tagged("BCX");
    bcx.tagged("Jason").info("Funky time");
    bcx.info("Junky time!");
    expect(output.string).toBe("[BCX] [Jason] Funky time\n[BCX] Junky time!\n");
  });

  it("shares tags across threads", () => {
    const tagged = logger.tagged("BCX");

    new Thread(() => {
      tagged.info("Dull story");
      tagged.tagged("OMG").info("Cool story");
    }).join();

    tagged.info("Funky time");

    expect(output.string).toBe("[BCX] Dull story\n[BCX] [OMG] Cool story\n[BCX] Funky time\n");
  });

  it("keeps formatter singleton class methods", () => {
    const plainOutput = makeBuffer();
    const plainLogger = new Logger(plainOutput);
    plainLogger.formatter = new Logger.Formatter();
    extend(plainLogger.formatter, {
      crozzMethod() {},
    });

    const taggedLogger = TaggedLogging.new(plainLogger);
    assertRespondTo(taggedLogger.formatter, "tagged");
    assertRespondTo(taggedLogger.formatter, "crozzMethod");
  });

  it("accepts non-String objects", () => {
    logger.tagged("tag", () => {
      logger.info([1, 2, 3] as never);
    });
    expect(output.string).toBe("[tag] [1, 2, 3]\n");
  });
});

describe("TaggedLoggingTest", () => {
  class MyLogger extends Logger {
    flush(): void {
      this.info("[FLUSHED]");
    }
  }

  let output: ReturnType<typeof makeBuffer>;
  let logger: ReturnType<typeof TaggedLogging.new>;
  beforeEach(() => {
    output = makeBuffer();
    logger = TaggedLogging.new(new MyLogger(output));
  });

  it("sets logger.formatter if missing and extends it with a tagging API", () => {
    const logger = new Logger(makeBuffer());
    logger.formatter = null;
    assertNil(logger.formatter);
    const otherLogger = TaggedLogging.new(logger);
    assertNotNil(otherLogger.formatter);
    assertRespondTo(otherLogger.formatter, "tagged");
  });

  it("provides access to the logger instance", () => {
    logger.tagged("BCX", (logger) => {
      logger.info("Funky time");
    });
    expect(output.string).toBe("[BCX] Funky time\n");
  });

  it("keeps each tag in their own instance", () => {
    const otherOutput = makeBuffer();
    const otherLogger = TaggedLogging.new(new MyLogger(otherOutput));
    logger.tagged("OMG", () => {
      otherLogger.tagged("BCX", () => {
        logger.info("Cool story");
        otherLogger.info("Funky time");
      });
    });
    expect(output.string).toBe("[OMG] Cool story\n");
    expect(otherOutput.string).toBe("[BCX] Funky time\n");
  });

  it("does not share the same formatter instance of the original logger", () => {
    const otherLogger = TaggedLogging.new(logger);
    logger.tagged("OMG", () => {
      otherLogger.tagged("BCX", () => {
        logger.info("Cool story");
        otherLogger.info("Funky time");
      });
    });
    expect(output.string).toBe("[OMG] Cool story\n[BCX] Funky time\n");
  });

  it("cleans up the taggings on flush", () => {
    logger.tagged("BCX", () => {
      new Thread(() => {
        logger.tagged("OMG", () => {
          logger.flush();
          logger.info("Cool story");
        });
      }).join();
    });
    expect(output.string).toBe("[FLUSHED]\nCool story\n");
  });

  it("implicit logger instance", () => {
    const output = makeBuffer();
    const logger = TaggedLogging.logger(output);
    logger.tagged("BCX", () => {
      logger.info("Funky time");
    });
    expect(output.string).toBe("[BCX] Funky time\n");
  });

  it("tagged once", () => {
    const t = logger.tagged("BCX");
    t.info("Funky time");
    expect(output.string).toBe("[BCX] Funky time\n");
  });

  it("tagged twice", () => {
    const outer = logger.tagged("BCX");
    const inner = outer.tagged("Jason");
    inner.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] Funky time\n");
  });

  it("tagged thrice at once", () => {
    const t = logger.tagged("BCX", "Jason", "New");
    t.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged with an array", () => {
    const t = logger.tagged(["BCX", "Jason", "New"]);
    t.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged are flattened", () => {
    const t = logger.tagged("BCX", ["Jason", "New"]);
    t.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("push and pop tags directly", () => {
    const pushed = logger.pushTags("A", ["B", "  ", ["C"]] as any);
    expect(pushed).toEqual(["A", "B", "C"]);
    logger.info("a");
    const popped1 = logger.popTags();
    expect(popped1).toEqual(["C"]);
    logger.info("b");
    const popped2 = logger.popTags(1);
    expect(popped2).toEqual(["B"]);
    logger.info("c");
    const cleared = logger.clearTagsBang();
    expect(cleared).toEqual([]);
    logger.info("d");
    expect(output.string).toBe("[A] [B] [C] a\n[A] [B] b\n[A] c\nd\n");
  });

  it("does not strip message content", () => {
    logger.info("  Hello");
    expect(output.string).toBe("  Hello\n");
  });

  it("tagged once with blank and nil", () => {
    const t = logger.tagged(null, "", "New");
    t.info("Funky time");
    expect(output.string).toBe("[New] Funky time\n");
  });

  it("keeps each tag in their own thread", () => {
    logger.tagged("BCX", () => {
      new Thread(() => {
        logger.info("Dull story");
        logger.tagged("OMG", () => {
          logger.info("Cool story");
        });
      }).join();
      logger.info("Funky time");
    });
    expect(output.string).toBe("Dull story\n[OMG] Cool story\n[BCX] Funky time\n");
  });

  it("keeps each tag in their own thread even when pushed directly", () => {
    new Thread(() => {
      logger.pushTags("OMG");
      logger.info("Cool story");
    }).join();
    logger.info("Funky time");
    expect(output.string).toBe("[OMG] Cool story\nFunky time\n");
  });

  it("mixed levels of tagging", () => {
    logger.tagged("BCX", () => {
      logger.tagged("Jason", () => {
        logger.info("Funky time");
      });
      logger.info("Junky time!");
    });
    expect(output.string).toBe("[BCX] [Jason] Funky time\n[BCX] Junky time!\n");
  });

  it("block form pushes and pops tags", () => {
    logger.tagged("BCX", (l) => {
      l.info("inside");
    });
    expect(output.string).toBe("[BCX] inside\n");
    expect(logger.formatter.currentTags).toEqual([]);
  });

  it("block form restores tags on error", () => {
    try {
      logger.tagged("ERR", () => {
        throw new Error("boom");
      });
    } catch {}
    expect(logger.formatter.currentTags).toEqual([]);
  });

  it("block form nested", () => {
    logger.tagged("A", (l) => {
      l.tagged("B", (l2) => {
        l2.info("deep");
      });
      l.info("shallow");
    });
    expect(output.string).toBe("[A] [B] deep\n[A] shallow\n");
  });
});

describe("TaggedLoggingWithoutBlockTest", () => {
  let output: ReturnType<typeof makeBuffer>;
  let logger: ReturnType<typeof TaggedLogging.new>;
  beforeEach(() => {
    output = makeBuffer();
    logger = TaggedLogging.new(new Logger(output));
  });

  function makeOutput() {
    const lines: string[] = [];
    return { write: (s: string) => lines.push(s), lines };
  }

  it("keeps each tag in their own instance", () => {
    const otherOutput = makeBuffer();
    const otherLogger = TaggedLogging.new(new Logger(otherOutput));
    const taggedLogger = logger.tagged("OMG");
    const otherTaggedLogger = otherLogger.tagged("BCX");
    taggedLogger.info("Cool story");
    otherTaggedLogger.info("Funky time");
    expect(output.string).toBe("[OMG] Cool story\n");
    expect(otherOutput.string).toBe("[BCX] Funky time\n");
  });

  it("does not share the same formatter instance of the original logger", () => {
    const otherLogger = TaggedLogging.new(logger);
    const taggedLogger = logger.tagged("OMG");
    const otherTaggedLogger = otherLogger.tagged("BCX");
    taggedLogger.info("Cool story");
    otherTaggedLogger.info("Funky time");
    expect(output.string).toBe("[OMG] Cool story\n[BCX] Funky time\n");
  });

  it("keeps broadcasting functionality", () => {
    const broadcastOutput = makeBuffer();
    const broadcastLogger = new BroadcastLogger(new Logger(broadcastOutput), logger);
    const loggerWithTags = TaggedLogging.new(broadcastLogger);
    const taggedLogger = loggerWithTags.tagged("OMG");
    taggedLogger.info("Broadcasting...");
    expect(output.string).toBe("[OMG] Broadcasting...\n");
    expect(broadcastOutput.string).toBe("[OMG] Broadcasting...\n");
  });

  it("accepts non-String objects as tags (converts to string)", () => {
    const output = makeOutput();
    const logger = new Logger(output);
    const tagged = TaggedLogging.new(logger);
    tagged.pushTags("42", "true");
    tagged.info("msg");
    expect(output.lines[0]).toContain("[42]");
    expect(output.lines[0]).toContain("[true]");
  });
});

describe("TagStack", () => {
  it("pushTags adds tags and returns them", () => {
    const stack = new TagStack();
    const pushed = stack.pushTags(["A", "B"]);
    expect(pushed).toEqual(["A", "B"]);
    expect(stack.tags).toEqual(["A", "B"]);
  });

  it("pushTags filters blank and null values", () => {
    const stack = new TagStack();
    stack.pushTags([null, "", "X", undefined, "  ", "Y"]);
    expect(stack.tags).toEqual(["X", "Y"]);
  });

  it("pushTags flattens deeply nested arrays", () => {
    const stack = new TagStack();
    stack.pushTags(["A", [["B", ["C"]]] as any]);
    expect(stack.tags).toEqual(["A", "B", "C"]);
  });

  it("popTags removes and returns tags from the end", () => {
    const stack = new TagStack();
    stack.pushTags(["A", "B", "C"]);
    const popped = stack.popTags(2);
    expect(popped).toEqual(["B", "C"]);
    expect(stack.tags).toEqual(["A"]);
  });

  it("clear removes all tags", () => {
    const stack = new TagStack();
    stack.pushTags(["A", "B"]);
    stack.clear();
    expect(stack.tags).toEqual([]);
  });

  it("pushTags keeps non-string tags and rejects blank ones", () => {
    const stack = new TagStack();
    const tag = new (class {
      toString(): string {
        return "obj";
      }
    })();
    stack.pushTags([null, undefined, 0, false, true, tag] as unknown[]);
    expect(stack.tags).toEqual([0, true, tag]);
    expect(stack.formatMessage("msg")).toBe("[0] [true] [obj] msg");
  });

  it("pushTags returns the argument array, flattened and filtered in place", () => {
    const stack = new TagStack();
    const tags: unknown[] = ["A", ["", ["B"]]];
    expect(stack.pushTags(tags)).toBe(tags);
    expect(tags).toEqual(["A", "B"]);
  });

  it("tags returns the backing array", () => {
    const stack = new TagStack();
    stack.pushTags(["A"]);
    const tags = stack.tags;
    stack.pushTags(["B"]);
    expect(tags).toEqual(["A", "B"]);
  });

  it("popTags pops at most the tags present", () => {
    const stack = new TagStack();
    stack.pushTags(["A", "B"]);
    expect(stack.popTags(0)).toEqual([]);
    expect(stack.popTags(5)).toEqual(["A", "B"]);
  });

  it("formatMessage with no tags returns message unchanged", () => {
    const stack = new TagStack();
    expect(stack.formatMessage("hello")).toBe("hello");
  });

  it("formatMessage with one tag", () => {
    const stack = new TagStack();
    stack.pushTags(["BCX"]);
    expect(stack.formatMessage("Funky time")).toBe("[BCX] Funky time");
  });

  it("formatMessage with multiple tags", () => {
    const stack = new TagStack();
    stack.pushTags(["BCX", "Jason"]);
    expect(stack.formatMessage("Funky time")).toBe("[BCX] [Jason] Funky time");
  });
});
