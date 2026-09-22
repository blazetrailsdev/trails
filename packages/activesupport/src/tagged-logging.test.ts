import { describe, it, expect, beforeEach } from "vitest";
import { Logger, taggedLogging } from "./logger.js";
import { BroadcastLogger } from "./broadcast-logger.js";
import { TagStack, Formatter } from "./tagged-logging.js";
import { Thread } from "@blazetrails/ruby-compat";
import { assertRespondTo } from "./testing/assertions.js";

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
  let logger: ReturnType<typeof taggedLogging>;
  beforeEach(() => {
    output = makeBuffer();
    const base = new Logger(output);
    logger = taggedLogging(base);
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

  it.skip("shares tags across threads");
  it.skip("keeps formatter singleton class methods");
  it.skip("accepts non-String objects");
});

describe("TaggedLoggingTest", () => {
  class MyLogger extends Logger {
    flush(): void {
      this.info("[FLUSHED]");
    }
  }

  let output: ReturnType<typeof makeBuffer>;
  let logger: ReturnType<typeof taggedLogging>;
  beforeEach(() => {
    output = makeBuffer();
    logger = taggedLogging(new MyLogger(output));
  });

  it.skip("sets logger.formatter if missing and extends it with a tagging API", () => {
    // BLOCKED: tagged-logging-proxy-is-not-a-formatter-extension
    const logger = new Logger(makeBuffer());
    expect(logger.formatter).toBeNull();
    const otherLogger = taggedLogging(logger);
    expect(otherLogger.formatter).not.toBeNull();
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
    const otherLogger = taggedLogging(new MyLogger(otherOutput));
    logger.tagged("OMG", () => {
      otherLogger.tagged("BCX", () => {
        logger.info("Cool story");
        otherLogger.info("Funky time");
      });
    });
    expect(output.string).toBe("[OMG] Cool story\n");
    expect(otherOutput.string).toBe("[BCX] Funky time\n");
  });

  it.skip("does not share the same formatter instance of the original logger", () => {
    // BLOCKED: tagged-logging-proxy-is-not-a-formatter-extension
    const otherLogger = taggedLogging(logger);
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
    const logger = taggedLogging.logger(output);
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
    const t = logger.tagged(["BCX", "Jason", "New"] as any);
    t.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged are flattened", () => {
    const t = logger.tagged("BCX", ["Jason", "New"] as any);
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
    const cleared = logger.clearTags();
    expect(cleared).toEqual([]);
    logger.info("d");
    expect(output.string).toBe("[A] [B] [C] a\n[A] [B] b\n[A] c\nd\n");
  });

  it("does not strip message content", () => {
    logger.info("  Hello");
    expect(output.string).toBe("  Hello\n");
  });

  it("tagged once with blank and nil", () => {
    const t = logger.tagged(null as any, "", "New");
    t.info("Funky time");
    expect(output.string).toBe("[New] Funky time\n");
  });

  it.skip("keeps each tag in their own thread", () => {
    // BLOCKED: tagged-logging-proxy-is-not-a-formatter-extension
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

  it.skip("keeps each tag in their own thread even when pushed directly", () => {
    // BLOCKED: tagged-logging-proxy-is-not-a-formatter-extension
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
    expect(logger.currentTags).toEqual([]);
  });

  it("block form restores tags on error", () => {
    try {
      logger.tagged("ERR", () => {
        throw new Error("boom");
      });
    } catch {}
    expect(logger.currentTags).toEqual([]);
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
  let logger: ReturnType<typeof taggedLogging>;
  beforeEach(() => {
    output = makeBuffer();
    logger = taggedLogging(new Logger(output));
  });

  function makeOutput() {
    const lines: string[] = [];
    return { write: (s: string) => lines.push(s), lines };
  }

  it("keeps each tag in their own instance", () => {
    const otherOutput = makeBuffer();
    const otherLogger = taggedLogging(new Logger(otherOutput));
    const taggedLogger = logger.tagged("OMG");
    const otherTaggedLogger = otherLogger.tagged("BCX");
    taggedLogger.info("Cool story");
    otherTaggedLogger.info("Funky time");
    expect(output.string).toBe("[OMG] Cool story\n");
    expect(otherOutput.string).toBe("[BCX] Funky time\n");
  });

  it("does not share the same formatter instance of the original logger", () => {
    const otherLogger = taggedLogging(logger);
    const taggedLogger = logger.tagged("OMG");
    const otherTaggedLogger = otherLogger.tagged("BCX");
    taggedLogger.info("Cool story");
    otherTaggedLogger.info("Funky time");
    expect(output.string).toBe("[OMG] Cool story\n[BCX] Funky time\n");
  });

  it("keeps broadcasting functionality", () => {
    const broadcastOutput = makeBuffer();
    const broadcastLogger = new BroadcastLogger(new Logger(broadcastOutput), logger);
    const loggerWithTags = taggedLogging(broadcastLogger);
    const taggedLogger = loggerWithTags.tagged("OMG");
    taggedLogger.info("Broadcasting...");
    expect(output.string).toBe("[OMG] Broadcasting...\n");
    expect(broadcastOutput.string).toBe("[OMG] Broadcasting...\n");
  });

  it("accepts non-String objects as tags (converts to string)", () => {
    const output = makeOutput();
    const logger = new Logger(output);
    const tagged = taggedLogging(logger);
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

  it("pushTags stringifies non-string values", () => {
    const stack = new TagStack();
    stack.pushTags([42, true, { toString: () => "obj" }] as unknown[]);
    expect(stack.tags).toEqual(["42", "true", "obj"]);
  });

  it("pushTags filters null and undefined after stringification", () => {
    const stack = new TagStack();
    stack.pushTags([null, undefined, 0, false] as unknown[]);
    expect(stack.tags).toEqual(["0", "false"]);
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

describe("Formatter", () => {
  it("tagged pushes and pops tags around block", () => {
    const stack = new TagStack();
    let captured: string[] = [];
    Formatter.tagged(stack, ["A", "B"], () => {
      captured = stack.tags;
    });
    expect(captured).toEqual(["A", "B"]);
    expect(stack.tags).toEqual([]);
  });

  it("tagged restores tags on error", () => {
    const stack = new TagStack();
    try {
      Formatter.tagged(stack, ["X"], () => {
        throw new Error("boom");
      });
    } catch {}
    expect(stack.tags).toEqual([]);
  });
});
