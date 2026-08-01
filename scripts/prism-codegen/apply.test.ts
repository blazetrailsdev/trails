import { describe, it, expect } from "vitest";
import { APPLY_MARKER, planApply } from "./apply.js";
import { indexPortTree } from "./score.js";

const generated = [
  "function first() {\n  return 1;\n}",
  "function second() {\n  return 2;\n}",
  "function third() {\n  return 3;\n}",
].join("\n");

const plan = (portSource: string, methodName: string, tree?: { path: string; source: string }[]) =>
  planApply({
    generatedCode: generated,
    portSource,
    portFile: "persistence.ts",
    methodName,
    globalIndex: tree ? indexPortTree(tree) : undefined,
  });

describe("prism-codegen apply", () => {
  it("inserts the draft after the nearest preceding def in Rails order", () => {
    const result = plan("export function first() {}\n\nexport function third() {}\n", "second");
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.insertedAfter).toBe("first");
    expect(result.source).toBe(
      "export function first() {}\n\n" +
        `${APPLY_MARKER}\nfunction second() {\n  return 2;\n}\n\n` +
        "export function third() {}\n",
    );
  });

  it("falls forward to the nearest following def when nothing precedes it", () => {
    const result = plan("export function third() {}\n", "second");
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.insertedBefore).toBe("third");
    expect(result.source.indexOf(APPLY_MARKER)).toBeLessThan(
      result.source.indexOf("export function third"),
    );
  });

  it("appends at end of file when no generated sibling is ported yet", () => {
    const result = plan("export const x = 1;\n", "second");
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.insertedAfter).toBeUndefined();
    expect(result.source).toBe(
      `export const x = 1;\n\n${APPLY_MARKER}\nfunction second() {\n  return 2;\n}\n`,
    );
  });

  it("anchors on a top-level arrow's statement, not on the arrow itself", () => {
    const result = plan("export const first = () => 1;\n", "second");
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.source).toBe(
      "export const first = () => 1;\n\n" +
        `${APPLY_MARKER}\nfunction second() {\n  return 2;\n}\n`,
    );
  });

  it("refuses when the method is already defined in the twin file", () => {
    const result = plan("export function second() {}\n", "second");
    expect(result).toEqual({
      status: "refused",
      reason: "second is already defined in persistence.ts.",
    });
  });

  it("refuses when the global index resolves the method in another file", () => {
    const result = plan("export function first() {}\n", "second", [
      { path: "persistence.ts", source: "export function first() {}\n" },
      { path: "relation/calculations.ts", source: "export function second() {}\n" },
    ]);
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toContain("already ported in relation/calculations.ts");
  });

  it("refuses when only the predicate name candidate is ported", () => {
    const result = planApply({
      generatedCode: "function isPersisted() {\n  return true;\n}",
      portSource: "export function persisted() {}\n",
      portFile: "persistence.ts",
      methodName: "isPersisted",
    });
    expect(result).toEqual({
      status: "refused",
      reason: "isPersisted is already defined in persistence.ts.",
    });
  });

  it("refuses a method the generator does not emit", () => {
    const result = plan("export function first() {}\n", "fourth");
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.reason).toContain("no generated def named fourth");
  });
});
