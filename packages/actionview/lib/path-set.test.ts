import { describe, expect, test, vi } from "vitest";

import { PathSet, type PathSetResolver } from "./path-set.js";
import { Requested } from "./template-details.js";
import { TemplatePath } from "./template-path.js";

function resolver(results: Record<string, unknown[]> = {}): PathSetResolver & {
  findAll: ReturnType<typeof vi.fn>;
} {
  return {
    findAll: vi.fn((path, prefix) => results[`${prefix}|${String(path)}`] ?? []),
  } as never;
}

const REQ = new Requested({
  locale: ["en", null],
  handlers: ["tse"],
  formats: ["html", null],
  variants: [],
});

describe("PathSet basics", () => {
  test("size + iteration + at()", () => {
    const r1 = resolver();
    const r2 = resolver();
    const ps = new PathSet([r1, r2]);
    expect(ps.size).toBe(2);
    expect(ps.at(0)).toBe(r1);
    expect([...ps]).toEqual([r1, r2]);
  });

  test("paths array is frozen", () => {
    const ps = new PathSet([resolver()]);
    expect(Object.isFrozen(ps.paths)).toBe(true);
  });

  test("plus() concatenates", () => {
    const r1 = resolver();
    const r2 = resolver();
    const ps = new PathSet([r1]).plus([r2]);
    expect(ps.size).toBe(2);
    expect(ps.at(1)).toBe(r2);
  });

  test("plus() accepts another PathSet", () => {
    const r1 = resolver();
    const r2 = resolver();
    const ps = new PathSet([r1]).plus(new PathSet([r2]));
    expect(ps.size).toBe(2);
  });

  test("includes() detects membership", () => {
    const r1 = resolver();
    const ps = new PathSet([r1]);
    expect(ps.includes(r1)).toBe(true);
    expect(ps.includes(resolver())).toBe(false);
  });
});

describe("PathSet#findAll search order", () => {
  test("iterates prefixes outer, resolvers inner", () => {
    const calls: string[] = [];
    const r1: PathSetResolver = {
      findAll: (_p, prefix) => {
        calls.push(`r1:${prefix}`);
        return [];
      },
    };
    const r2: PathSetResolver = {
      findAll: (_p, prefix) => {
        calls.push(`r2:${prefix}`);
        return [];
      },
    };
    new PathSet([r1, r2]).findAll("show", ["A", "B"], false, REQ, null, []);
    expect(calls).toEqual(["r1:A", "r2:A", "r1:B", "r2:B"]);
  });

  test("returns first non-empty result and stops", () => {
    const r1 = resolver();
    const r2 = resolver({ "users|show": [{ tag: "hit" }] });
    const r3 = resolver({ "users|show": [{ tag: "later" }] });
    const out = new PathSet([r1, r2, r3]).findAll("show", "users", false, REQ, null, []);
    expect(out).toEqual([{ tag: "hit" }]);
    expect(r3.findAll as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  test("accepts a single prefix string", () => {
    const r1 = resolver({ "users|show": [{ tag: "ok" }] });
    const out = new PathSet([r1]).findAll("show", "users", false, REQ, null, []);
    expect(out).toEqual([{ tag: "ok" }]);
  });

  test("accepts a TemplatePath instance", () => {
    const r1 = resolver({ "users|users/show": [{ tag: "ok" }] });
    const tp = TemplatePath.parse("users/show");
    const out = new PathSet([r1]).findAll(tp, "users", false, REQ, null, []);
    expect(out).toEqual([{ tag: "ok" }]);
  });
});

describe("PathSet#find / #exists", () => {
  test("find returns first when match exists", () => {
    const r1 = resolver({ "users|show": [{ tag: "ok" }] });
    expect(new PathSet([r1]).find("show", "users", false, REQ, null, [])).toEqual({ tag: "ok" });
  });

  test("find throws when nothing matches", () => {
    const r1 = resolver();
    expect(() => new PathSet([r1]).find("show", "users", false, REQ, null, [])).toThrow(
      /Missing template/,
    );
  });

  test("exists reflects findAll results", () => {
    const r1 = resolver({ "users|show": [{ tag: "ok" }] });
    expect(new PathSet([r1]).exists("show", "users", false, REQ, null, [])).toBe(true);
    expect(new PathSet([r1]).exists("missing", "users", false, REQ, null, [])).toBe(false);
  });
});
