import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestSpan", () => {
  it("span width", () => {
    const span = new Chronic.Span(Time.local(2006, 8, 16, 0), Time.local(2006, 8, 17, 0));
    expect(span.width()).toEqual(60 * 60 * 24);
  });

  it("span math", () => {
    const s = new Chronic.Span(1 as never, 2 as never);
    expect(s.plus(1).begin).toEqual(2);
    expect(s.plus(1).end).toEqual(3);
    expect(s.minus(1).begin).toEqual(0);
    expect(s.minus(1).end).toEqual(1);
  });
});
