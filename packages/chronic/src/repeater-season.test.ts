import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterSeason", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("next future", () => {
    const seasons = new Chronic.RepeaterSeason("season");
    seasons.start = now;

    const nextSeason = seasons.next("future");
    expect(nextSeason.begin).toEqualRuby(Time.local(2006, 9, 23));
    expect(nextSeason.end).toEqualRuby(Time.local(2006, 12, 21));
  });

  it("next past", () => {
    const seasons = new Chronic.RepeaterSeason("season");
    seasons.start = now;

    const lastSeason = seasons.next("past");
    expect(lastSeason.begin).toEqualRuby(Time.local(2006, 3, 20));
    expect(lastSeason.end).toEqualRuby(Time.local(2006, 6, 20));
  });

  it("this", () => {
    const seasons = new Chronic.RepeaterSeason("season");
    seasons.start = now;

    let thisSeason = seasons.this("future");
    expect(thisSeason.begin).toEqualRuby(Time.local(2006, 8, 17));
    expect(thisSeason.end).toEqualRuby(Time.local(2006, 9, 22));

    thisSeason = seasons.this("past")!;
    expect(thisSeason.begin).toEqualRuby(Time.local(2006, 6, 21));
    expect(thisSeason.end).toEqualRuby(Time.local(2006, 8, 16));
  });
});
