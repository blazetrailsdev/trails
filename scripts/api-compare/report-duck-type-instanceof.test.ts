import { describe, expect, it } from "vitest";
import {
  asksDuckType,
  declaresActsLikeCall,
  declaresInstanceofGuard,
  renderReport,
  unportedDuckTests,
} from "./report-duck-type-instanceof.js";
import type { SkeletonRow } from "./report-arms.js";

function row(ruby: string[], ts: string[], tsHelpers?: Record<string, string[]>): SkeletonRow {
  return {
    package: "activemodel",
    rubyFile: "type/date.rb",
    rubyName: "cast_value",
    tsFile: "type/date.ts",
    tsName: "castValue",
    ruby,
    ts,
    tsHelpers,
  };
}

describe("report-duck-type-instanceof", () => {
  it("keys the Ruby side on respond_to? and acts_like?", () => {
    expect(asksDuckType(row(["if", "ref:respond_to?"], []))).toBe(true);
    expect(asksDuckType(row(["ref:acts_like?"], []))).toBe(true);
    expect(asksDuckType(row(["ref:is_a?"], []))).toBe(false);
  });

  it("credits a port that calls rbObjRespondTo or actsLike, through a same-file helper too", () => {
    const ask = ["ref:respond_to?"];
    expect(unportedDuckTests(row(ask, ["ref:rbObjRespondTo"]))).toEqual([]);
    expect(unportedDuckTests(row(["ref:acts_like?"], ["ref:actsLike"]))).toEqual([]);
    expect(unportedDuckTests(row(ask, ["ref:helper"], { helper: ["ref:rbObjRespondTo"] }))).toEqual(
      [],
    );
    expect(unportedDuckTests(row(ask, ["ref:helper"]))).toEqual(ask);
  });

  it("finds an instanceof guard in the named declaration only", () => {
    const source = `
      class DateType {
        castValue(value: unknown) {
          if (value instanceof Temporal.PlainDate) return value;
        }
        other(value: unknown) { return value; }
      }
      export function other2(value: unknown) { return value instanceof Date; }
    `;
    expect(declaresInstanceofGuard(source, "castValue")).toBe(true);
    expect(declaresInstanceofGuard(source, "other")).toBe(false);
    expect(declaresInstanceofGuard(source, "other2")).toBe(true);
  });

  it("does not count a catch clause's rescue arm or a Promise check", () => {
    const source = `
      function translate(e: unknown) {
        try { run(); } catch (err) { if (err instanceof StatementInvalid) throw err; }
        return e instanceof Promise ? e : undefined;
      }
    `;
    expect(declaresInstanceofGuard(source, "translate")).toBe(false);
  });

  it("lists a body that asks both duck tests and ports only one", () => {
    const both = ["ref:acts_like?", "ref:respond_to?"];
    expect(unportedDuckTests(row(both, ["ref:rbObjRespondTo"]))).toEqual(["ref:acts_like?"]);
    expect(unportedDuckTests(row(both, ["ref:actsLike"]))).toEqual(["ref:respond_to?"]);
    expect(unportedDuckTests(row(both, ["ref:rbObjRespondTo", "ref:actsLike"]))).toEqual([]);
    expect(unportedDuckTests(row(["ref:is_a?"], []))).toEqual([]);
  });

  it("reads actsLike.call, .apply and an aliased import as the acts_like? port", () => {
    const source = `
      import { actsLike as actsLikeDuck } from "@blazetrails/activesupport";
      function castValue(time: unknown) {
        if (time instanceof TimeWithZone || !actsLike.call(time, "time")) return time;
      }
      function applied(time: unknown) { return actsLike.apply(time, ["time"]); }
      function aliased(time: unknown) { return actsLikeDuck.call(time, "time"); }
      function local(time: unknown) { return actsLikeTime(time); }
    `;
    expect(declaresActsLikeCall(source, "castValue")).toBe(true);
    expect(declaresActsLikeCall(source, "applied")).toBe(true);
    expect(declaresActsLikeCall(source, "aliased")).toBe(true);
    expect(declaresActsLikeCall(source, "local")).toBe(false);
  });

  it("reads an arrow-function property as a declaration", () => {
    const source = "const castValue = (v: unknown) => v instanceof BigDecimal;";
    expect(declaresInstanceofGuard(source, "castValue")).toBe(true);
  });

  it("renders the pair against its Rails method", () => {
    const out = renderReport([row(["ref:respond_to?"], [])], 1);
    expect(out).toContain("1 pair(s) of 1");
    expect(out).toContain("activemodel/type/date.ts#castValue  <-  type/date.rb#cast_value");
  });
});
