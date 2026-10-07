import { describe, expect, it } from "vitest";
import type { HyphenOptions } from "@blazetrails/tse-compiler";
import { virtualizeTse, virtualizeTseWithDeltas } from "./tse.js";
import { diagnose } from "./tse-diagnose.js";

const LP: HyphenOptions = { resolve: "literal", positions: "property" };
const AP: HyphenOptions = { resolve: "alias", positions: "property" };

function sourceColumn(src: string, needle: string, view: string, o: HyphenOptions): number {
  const { ts, mappings } = virtualizeTseWithDeltas(src, { view }, o);
  const lines = ts.split("\n");
  const genLine = lines.findIndex((l) => l.includes("_ob.append(") && l.includes(needle));
  const genCol = lines[genLine].indexOf(needle);
  const m = mappings
    .filter((x) => x.genLine === genLine && x.genCol! <= genCol)
    .sort((a, b) => b.genCol! - a.genCol!)[0];
  expect(m.srcLine).toBe(0);
  return m.srcCol! + (genCol - m.genCol!);
}

describe("SPIKE: hyphen-case names in the typecheck shim", () => {
  it("type-checks a literal key against a quoted member", () => {
    const view = `{ "window-size": string }`;
    expect(diagnose(virtualizeTse("<%= this.window-size.length %>", { view }, LP))).toEqual([]);
    expect(
      diagnose(virtualizeTse("<%= this.window-size.toFixed() %>", { view }, LP)).join("\n"),
    ).toMatch(/'toFixed' does not exist on type 'string'/);
    expect(diagnose(virtualizeTse("<%= this.window-height %>", { view }, LP)).join("\n")).toMatch(
      /'window-height' does not exist/,
    );
  });

  it("type-checks an alias against the camelCase member", () => {
    const view = `{ windowSize: string }`;
    expect(diagnose(virtualizeTse("<%= this.window-size.length %>", { view }, AP))).toEqual([]);
    expect(diagnose(virtualizeTse("<%= this.window-size %>", { view }, LP)).join("\n")).toMatch(
      /window-size/,
    );
  });

  it("reads the camelCase binding for shorthand under both resolutions", () => {
    const view = `{ windowSize: number; f(o: object): string }`;
    expect(diagnose(virtualizeTse("<%= f({window-size}) %>", { view }, LP))).toEqual([]);
    expect(diagnose(virtualizeTse("<%= f({window-size}) %>", { view }, AP))).toEqual([]);
  });

  it("maps a column after a rewrite back to the right .tse column", () => {
    const view = `{ "window-size": string; "a-b": { x: number } }`;
    const src = "<%= this.window-size.toFixed() + this.a-b.x %>";
    expect(sourceColumn(src, "toFixed", view, LP)).toBe(src.indexOf("toFixed"));
    expect(sourceColumn(src, "x %>".slice(0, 1) + ");", view, LP)).toBe(src.indexOf("x %>"));
    const aliasView = `{ windowSize: string; aB: { x: number } }`;
    expect(sourceColumn(src, "toFixed", aliasView, AP)).toBe(src.indexOf("toFixed"));
  });

  it("maps the rewritten name itself to the start of the hyphenated name", () => {
    const src = "<%= this.window-size %>";
    const view = `{ "window-size": string }`;
    expect(sourceColumn(src, `["window-size"]`, view, LP)).toBe(src.indexOf(".window-size"));
  });

  it("leaves a template without the option exactly as before", () => {
    expect(virtualizeTse("<%= a-b %>")).toContain("_ob.append(a-b);");
  });
});
