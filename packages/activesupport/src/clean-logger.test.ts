import { describe, expect, it } from "vitest";

import { Logger } from "./logger.js";
import { rbInspect } from "@blazetrails/ruby-compat";

describe("CleanLoggerTest", () => {
  it("format message", () => {
    const lines: string[] = [];
    const logger = new Logger({ write: (s) => lines.push(s) });
    logger.error("error");
    expect(lines.join("")).toEqual("error\n");
  });

  it("datetime format", () => {
    const lines: string[] = [];
    const logger = new Logger({ write: (s) => lines.push(s) });
    (logger as any).formatter = new (Logger as any).Formatter();
    (logger as any).formatter.datetimeFormat = "%Y-%m-%d";
    logger.debug("debug");
    expect((logger as any).formatter.datetimeFormat).toEqual("%Y-%m-%d");
    expect(lines.join("")).toMatch(/D, \[\d\d\d\d-\d\d-\d\d[ ]?#\d+\] DEBUG -- : debug/);
  });

  it("nonstring formatting", () => {
    const lines: string[] = [];
    const logger = new Logger({ write: (s) => lines.push(s) });
    const anObject = [1, 2, 3, 4, 5];
    logger.debug(anObject as unknown as string);
    expect(lines.join("")).toEqual(`${rbInspect(anObject)}\n`);
  });
});
