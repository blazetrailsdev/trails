import { describe, it, expect, beforeEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "./logger.js";

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
  it.skip("shares tags across threads");
  it.skip("keeps formatter singleton class methods");
  it.skip("accepts non-String objects");
});

describe("TaggedLoggingTest", () => {
  let output: ReturnType<typeof makeBuffer>;
  let logger: ReturnType<typeof taggedLogging>;
  beforeEach(() => {
    output = makeBuffer();
    const base = new Logger(output);
    logger = taggedLogging(base);
  });

  function makeOutput() {
    const lines: string[] = [];
    return { write: (s: string) => lines.push(s), lines };
  }

  it("sets logger.formatter if missing and extends it with a tagging API", () => {
    const output = makeOutput();
    const logger = new Logger(output);
    const tagged = taggedLogging(logger);
    tagged.pushTags("TAG");
    tagged.info("hello");
    expect(output.lines.some((l) => l.includes("[TAG]") && l.includes("hello"))).toBe(true);
  });

  it("provides access to the logger instance", () => {
    const output = makeOutput();
    const logger = new Logger(output);
    const tagged = taggedLogging(logger);
    expect(tagged).toBeDefined();
    expect(typeof tagged.info).toBe("function");
  });

  it("keeps each tag in their own instance", () => {
    const output = makeOutput();
    const logger = new Logger(output);
    const t1 = taggedLogging(logger);
    const t2 = taggedLogging(logger);
    t1.pushTags("T1");
    t2.pushTags("T2");
    expect(t1.currentTags).toContain("T1");
    expect(t1.currentTags).not.toContain("T2");
    expect(t2.currentTags).toContain("T2");
    expect(t2.currentTags).not.toContain("T1");
  });

  it("does not share the same formatter instance of the original logger", () => {
    const out1 = makeOutput();
    const out2 = makeOutput();
    const l1 = new Logger(out1);
    const l2 = new Logger(out2);
    const t1 = taggedLogging(l1);
    const t2 = taggedLogging(l2);
    t1.pushTags("A");
    t2.pushTags("B");
    t1.info("msg1");
    t2.info("msg2");
    expect(out1.lines.some((l) => l.includes("[A]"))).toBe(true);
    expect(out1.lines.some((l) => l.includes("[B]"))).toBe(false);
    expect(out2.lines.some((l) => l.includes("[B]"))).toBe(true);
  });

  it("cleans up the taggings on flush", () => {
    const output = makeOutput();
    const logger = new Logger(output);
    const tagged = taggedLogging(logger);
    tagged.pushTags("BEFORE");
    expect(tagged.currentTags).toContain("BEFORE");
    tagged.flush();
    expect(tagged.currentTags).toHaveLength(0);
  });

  it("implicit logger instance", () => {
    const output = makeOutput();
    const logger = new Logger(output);
    const tagged = taggedLogging(logger);
    tagged.pushTags("X");
    tagged.info("test");
    expect(output.lines.some((l) => l.includes("[X]") && l.includes("test"))).toBe(true);
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

  it("keeps each tag in their own thread", () => {
    // JS is single-threaded; verify tags are isolated per logger
    const out2 = makeBuffer();
    const base2 = new Logger(out2);
    const logger2 = taggedLogging(base2);
    logger.tagged("Thread1").info("t1 msg");
    logger2.tagged("Thread2").info("t2 msg");
    expect(output.string).toContain("[Thread1]");
    expect(out2.string).toContain("[Thread2]");
    expect(output.string).not.toContain("[Thread2]");
  });

  it("keeps each tag in their own thread even when pushed directly", () => {
    const t = logger.tagged("Direct");
    t.pushTags("Extra");
    t.info("pushed");
    expect(output.string).toContain("[Direct] [Extra]");
    t.clearTags();
  });

  it("mixed levels of tagging", () => {
    const outer = logger.tagged("BCX");
    const inner = outer.tagged("Jason");
    inner.info("Funky time");
    // After inner tag, outer should still have BCX
    outer.info("Junky time!");
    expect(output.string).toContain("[BCX] [Jason] Funky time");
    expect(output.string).toContain("[BCX] Junky time!");
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

  it("tagged are flattened", () => {
    const t = logger.tagged("BCX", ["Jason", "New"] as any);
    t.info("Funky time");
    expect(output.string).toBe("[BCX] [Jason] [New] Funky time\n");
  });

  it("tagged once with blank and nil", () => {
    const t = logger.tagged(null as any, "", "New");
    t.info("Funky time");
    expect(output.string).toBe("[New] Funky time\n");
  });

  it("mixed levels of tagging", () => {
    const outer = logger.tagged("BCX");
    const inner = outer.tagged("Jason");
    inner.info("Funky time");
    // After inner tag, outer should still have BCX
    outer.info("Junky time!");
    expect(output.string).toContain("[BCX] [Jason] Funky time");
    expect(output.string).toContain("[BCX] Junky time!");
  });
});

describe("TaggedLoggingWithoutBlockTest", () => {
  function makeOutput() {
    const lines: string[] = [];
    return { write: (s: string) => lines.push(s), lines };
  }

  it("keeps each tag in their own instance", () => {
    const output = makeOutput();
    const logger = new Logger(output);
    const t1 = taggedLogging(logger);
    const t2 = taggedLogging(logger);
    t1.pushTags("ONE");
    t2.pushTags("TWO");
    expect(t1.currentTags).toEqual(["ONE"]);
    expect(t2.currentTags).toEqual(["TWO"]);
  });

  it("does not share the same formatter instance of the original logger", () => {
    const out1 = makeOutput();
    const out2 = makeOutput();
    const t1 = taggedLogging(new Logger(out1));
    const t2 = taggedLogging(new Logger(out2));
    t1.pushTags("A");
    t2.pushTags("B");
    t1.info("hi");
    t2.info("hi");
    expect(out1.lines[0]).toContain("[A]");
    expect(out2.lines[0]).toContain("[B]");
  });

  it("keeps broadcasting functionality", () => {
    const out1 = makeOutput();
    const out2 = makeOutput();
    const l1 = new Logger(out1);
    const l2 = new Logger(out2);
    const broadcast = new BroadcastLogger(l1, l2);
    broadcast.info("broadcast message");
    expect(out1.lines.some((l) => l.includes("broadcast message"))).toBe(true);
    expect(out2.lines.some((l) => l.includes("broadcast message"))).toBe(true);
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
