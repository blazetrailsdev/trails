import { describe, expect, it } from "vitest";
import {
  asksDuckType,
  declaresInstanceofGuard,
  portsDuckType,
  renderReport,
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
    expect(portsDuckType(row([], ["ref:rbObjRespondTo"]))).toBe(true);
    expect(portsDuckType(row([], ["ref:actsLike"]))).toBe(true);
    expect(portsDuckType(row([], ["ref:helper"], { helper: ["ref:rbObjRespondTo"] }))).toBe(true);
    expect(portsDuckType(row([], ["ref:helper"]))).toBe(false);
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
