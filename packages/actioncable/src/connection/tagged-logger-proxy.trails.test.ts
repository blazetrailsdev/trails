import { describe, expect, it } from "vitest";
import { Logger, TaggedLogging } from "@blazetrails/activesupport";
import { TaggedLoggerProxy } from "./tagged-logger-proxy.js";

function buildLogger() {
  const lines: string[] = [];
  const logger = TaggedLogging.new(
    new Logger({ write: (line: string) => void lines.push(line), close: () => {} } as never),
  );
  return { logger, lines };
}

describe("ActionCable::Connection::TaggedLoggerProxy", () => {
  it("tags messages against a tagged logger, skipping tags already current", () => {
    const { logger, lines } = buildLogger();
    const proxy = new TaggedLoggerProxy(logger, { tags: [["a"], "b"] });
    expect(proxy.tags).toEqual(["a", "b"]);
    logger.tagged("a", () => proxy.info("hello"));
    expect(lines.join("")).toContain("[a] [b] hello");
    expect(lines.join("")).not.toContain("[a] [a]");
  });

  it("yields directly to a plain logger", () => {
    const messages: unknown[] = [];
    const plain = { info: (message: unknown) => messages.push(message) };
    const proxy = new TaggedLoggerProxy(plain, { tags: ["a"] });
    expect(proxy.tag(plain, () => 42)).toBe(42);
    proxy.info("plain");
    expect(messages).toEqual(["plain"]);
  });

  it("keeps tags until an async block settles", async () => {
    const { logger, lines } = buildLogger();
    const proxy = new TaggedLoggerProxy(logger, { tags: ["conn"] });
    await proxy.tag(logger, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      logger.info("later");
    });
    expect(lines.join("")).toContain("[conn] later");
  });

  it("adds tags without duplicates, reassigning the array", () => {
    const proxy = new TaggedLoggerProxy(null, { tags: ["a"] });
    const before = proxy.tags;
    proxy.addTags("a", ["b"]);
    expect(proxy.tags).toEqual(["a", "b"]);
    expect(before).toEqual(["a"]);
  });

  it("does not run a severity block above the logger level", () => {
    const { logger } = buildLogger();
    logger.level = Logger.INFO;
    const proxy = new TaggedLoggerProxy(logger, { tags: [] });
    let ran = false;
    proxy.debug(null, () => {
      ran = true;
      return "x";
    });
    expect(ran).toBe(false);
  });
});
