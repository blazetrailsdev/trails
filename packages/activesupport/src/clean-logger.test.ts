import { describe, expect, it } from "vitest";

import { Logger } from "./logger.js";

describe("CleanLoggerTest", () => {
  it("format message", () => {
    const lines: string[] = [];
    const logger = new Logger({ write: (s) => lines.push(s) });
    logger.info("Hello World");
    expect(lines.some((l) => l.includes("Hello World"))).toBe(true);
  });

  it("datetime format", () => {
    const lines: string[] = [];
    const logger = new Logger({ write: (s) => lines.push(s) });
    logger.formatter = (severity, datetime, _prog, msg) =>
      `[${datetime.toISOString()}] ${severity}: ${msg}\n`;
    logger.info("test");
    expect(lines[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}/);
  });

  it("nonstring formatting", () => {
    const lines: string[] = [];
    const logger = new Logger({ write: (s) => lines.push(s) });
    logger.info(String(42));
    expect(lines.some((l) => l.includes("42"))).toBe(true);
  });
});
