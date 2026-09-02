import { expect, it } from "vitest";

import { Frame, ShowExceptions } from "./show-exceptions.js";

// `pretty` builds one `Frame` per backtrace line (`show_exceptions.rb:82-104`),
// filling the eight Struct members (:21-24) with the source context around it.
class Exposed extends ShowExceptions {
  frames(exception: Error): Frame[] {
    const captured: Frame[] = [];
    this.capture = captured;
    this.pretty({ SCRIPT_NAME: "", PATH_INFO: "/" }, exception);
    return captured;
  }
  capture: Frame[] = [];
  protected template(_env: Record<string, any>, _e: Error, _path?: string, frames?: Frame[]) {
    this.capture.push(...(frames ?? []));
    return "";
  }
}

it("builds a Frame per backtrace line with its source context", () => {
  const e = new Error("boom");
  const frames = new Exposed(async () => [200, {}, []]).frames(e);

  expect(frames.length).toBeGreaterThan(0);
  const frame = frames[0];
  expect(frame.filename).toContain("show-exceptions.trails.test.ts");
  expect(frame.lineno).toBeGreaterThan(0);
  expect(frame.preContextLineno).toBe(Math.max(frame.lineno! - 1 - ShowExceptions.CONTEXT, 0));
  expect(frame.preContext).toHaveLength(frame.lineno! - 1 - frame.preContextLineno!);
  expect(frame.contextLine).toContain("new Error");
  expect(frame.postContext).toHaveLength(frame.postContextLineno! - (frame.lineno! - 1));
});
