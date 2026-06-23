/**
 * Unit tests for the strip-asany codemod's pure transform layer (candidate
 * detection + textual removal). The recompile/revert loop is exercised
 * end-to-end when the tool is run for real in burndown PRs; here we pin down
 * the scope rules against a fixture file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { findCandidateCasts, removeCast, applyCasts, stripFile } from "./strip-asany.js";

const FIXTURE = resolve(import.meta.dirname, "__fixtures__", "strip-asany-fixture.ts");
const fixtureText = readFileSync(FIXTURE, "utf8");

describe("findCandidateCasts", () => {
  it("matches only `(expr as any).member` with a non-underscore member", () => {
    const members = findCandidateCasts(fixtureText).map((c) => c.member);
    expect(members).toEqual(["id", "name", "toFixed", "toFixed"]);
  });

  it("skips underscore (private) member reaches", () => {
    expect(findCandidateCasts("(x as any)._privateField;")).toEqual([]);
  });

  it("skips array casts (`as any[]`)", () => {
    expect(findCandidateCasts("(x as any[]).length;")).toEqual([]);
  });

  it("skips terminal casts with no member access", () => {
    expect(findCandidateCasts("const y = x as any;")).toEqual([]);
  });

  it("keeps only the outermost of an enclosing (nested) cast pair", () => {
    const spans = findCandidateCasts("((foo as any).bar as any).baz");
    expect(spans).toHaveLength(1);
    expect(spans[0].member).toBe("baz");
  });
});

describe("removeCast", () => {
  it("drops the redundant parens when the inner expression is left-hand-side", () => {
    const text = "(thing as any).id";
    const [span] = findCandidateCasts(text);
    expect(removeCast(text, span)).toBe("thing.id");
  });

  it("keeps load-bearing parens for a non-left-hand-side inner expression", () => {
    const text = "(a + b as any).toFixed";
    const [span] = findCandidateCasts(text);
    expect(removeCast(text, span)).toBe("(a + b).toFixed");
  });

  it("keeps parens around a numeric literal so `5.` is not re-lexed as a float", () => {
    const text = "(5 as any).toFixed";
    const [span] = findCandidateCasts(text);
    expect(removeCast(text, span)).toBe("(5).toFixed");
  });

  it("strips a nested cast pair across two idempotent passes without corruption", () => {
    let text = "((foo as any).bar as any).baz";
    const [outer] = findCandidateCasts(text);
    text = removeCast(text, outer);
    expect(text).toBe("(foo as any).bar.baz");
    const [inner] = findCandidateCasts(text);
    text = removeCast(text, inner);
    expect(text).toBe("foo.bar.baz");
  });

  it("removes only the targeted casts when applied end-to-start", () => {
    const spans = findCandidateCasts(fixtureText).sort((a, b) => b.start - a.start);
    const out = applyCasts(fixtureText, spans);
    expect(out).toContain("sink(thing.id);");
    expect(out).toContain("sink(getThing().name);");
    expect(out).toContain("sink((a + b).toFixed);");
    expect(out).toContain("sink((5).toFixed);");
    // Untouched scopes survive verbatim.
    expect(out).toContain("sink((thing as any)._privateField);");
    expect(out).toContain("sink((thing as any[]).length);");
    expect(out).toContain("sink(thing as any);");
  });
});

describe("stripFile (batch-then-bisect)", () => {
  // Four `(x as any).m` casts; the verifier rejects any text in which the
  // load-bearing `.keep` cast was removed, accepting every other combination.
  // The .keep removal turns `(x as any).keep` into `x.keep`.
  const source = [
    "sink((a as any).one);",
    "sink((b as any).keep);",
    "sink((c as any).two);",
    "sink((d as any).three);",
    "",
  ].join("\n");

  async function withTempFile<T>(text: string, fn: (file: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), "strip-asany-"));
    const file = join(dir, "input.ts");
    await writeFile(file, text);
    try {
      return await fn(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("removes every candidate in one build when all are gratuitous", async () => {
    await withTempFile(source, async (file) => {
      let builds = 0;
      const verify: (text: string) => Promise<boolean> = async (text) => {
        builds += 1;
        await writeFile(file, text);
        return true;
      };
      const result = await stripFile(file, verify);
      expect(result.candidates).toBe(4);
      expect(result.removed).toBe(4);
      expect(result.kept).toBe(0);
      expect(builds).toBe(1);
      expect(await readFile(file, "utf8")).not.toContain("as any");
    });
  });

  it("bisects a failing batch to isolate and revert the load-bearing cast", async () => {
    await withTempFile(source, async (file) => {
      const verify: (text: string) => Promise<boolean> = async (text) => {
        await writeFile(file, text);
        return text.includes("(b as any).keep");
      };
      const result = await stripFile(file, verify);
      expect(result.candidates).toBe(4);
      expect(result.removed).toBe(3);
      expect(result.kept).toBe(1);

      const final = await readFile(file, "utf8");
      expect(final).toContain("(b as any).keep");
      expect(final).toContain("sink(a.one);");
      expect(final).toContain("sink(c.two);");
      expect(final).toContain("sink(d.three);");
    });
  });

  it("isolates multiple non-adjacent load-bearing casts in one file", async () => {
    // `.keep` (idx 1) and `.hold` (idx 4) are both load-bearing and sit in
    // different bisect halves, so the recursion must split both ways.
    const text = [
      "sink((a as any).one);",
      "sink((b as any).keep);",
      "sink((c as any).two);",
      "sink((d as any).three);",
      "sink((e as any).hold);",
      "sink((f as any).four);",
      "",
    ].join("\n");
    await withTempFile(text, async (file) => {
      const verify: (t: string) => Promise<boolean> = async (t) => {
        await writeFile(file, t);
        return t.includes("(b as any).keep") && t.includes("(e as any).hold");
      };
      const result = await stripFile(file, verify);
      expect(result.candidates).toBe(6);
      expect(result.removed).toBe(4);
      expect(result.kept).toBe(2);

      const final = await readFile(file, "utf8");
      expect(final).toContain("(b as any).keep");
      expect(final).toContain("(e as any).hold");
      for (const removed of ["a.one", "c.two", "d.three", "f.four"]) {
        expect(final).toContain(`sink(${removed});`);
      }
    });
  });

  it("reverts the same span the per-cast loop would for a mutually-exclusive pair", async () => {
    // Two casts that are each individually removable but fail together (green
    // iff at least one `as any` survives). The old descending per-cast loop
    // processes the higher-offset span first and keeps it, reverting the
    // lower-offset one; batch-bisect must make the identical choice.
    const text = ["sink((a as any).id);", "sink((b as any).id);", ""].join("\n");
    await withTempFile(text, async (file) => {
      const verify: (t: string) => Promise<boolean> = async (t) => {
        await writeFile(file, t);
        return t.includes("as any");
      };
      const result = await stripFile(file, verify);
      expect(result.removed).toBe(1);
      expect(result.kept).toBe(1);

      const final = await readFile(file, "utf8");
      // Lower-offset span (line 1) reverted; higher-offset span (line 2) removed.
      expect(final).toContain("sink((a as any).id);");
      expect(final).toContain("sink(b.id);");
    });
  });
});
