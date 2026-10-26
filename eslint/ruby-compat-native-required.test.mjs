import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "./ruby-compat-native-required.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, "fixtures", "ruby-compat-native-required");
const filename = path.join(fixtureDir, "file.ts");

const parser = (await import("typescript-eslint")).parser;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser,
    parserOptions: { project: "./tsconfig.json", tsconfigRootDir: fixtureDir },
  },
});

function parseFixture(code) {
  const { ast, services } = parser.parseForESLint(code, {
    filePath: filename,
    project: "./tsconfig.json",
    tsconfigRootDir: fixtureDir,
  });
  return { ast, services };
}

const head = 'import { hashDelete, Hash } from "@blazetrails/ruby-compat";\n';
const valid = (code) => ({ code: head + code, filename });
const invalid = (code) => ({
  code: head + code,
  filename,
  errors: [{ messageId: "nativeRequired" }],
});

tester.run("ruby-compat-native-required", rule, {
  valid: [
    // unknown / any: the helper may dispatch
    valid("declare const h: unknown; hashDelete(h as object, 'a');"),
    valid("declare const h: any; hashDelete(h, 'a');"),
    // dispatching receivers
    valid("declare const h: Map<string, number>; hashDelete(h, 'a');"),
    valid("declare const h: Hash; hashDelete(h, 'a');"),
    valid("class Box { a = 1 } declare const h: Box; hashDelete(h, 'a');"),
    valid("declare const h: { a: 1; delete(k: string): unknown }; hashDelete(h, 'a');"),
    valid("declare const h: Record<string, number> | Map<string, number>; hashDelete(h, 'a');"),
    valid("function f<T extends object>(h: T) { hashDelete(h, 'a'); }"),
    // the removed value is read, or a miss block is passed: no native form
    valid("declare const h: Record<string, number>; const v = hashDelete(h, 'a');"),
    valid("declare const h: Record<string, number>; hashDelete(h, 'a', () => 1);"),
    // not the ruby-compat export
    // `kinds`: an Array method on a plain object dispatches
    {
      code: 'import { compact } from "@blazetrails/ruby-compat";\ndeclare const h: { a?: number }; compact(h as never);',
      filename,
    },
    // `elements`: object elements compare by eql?, not identity
    {
      code: 'import { uniq } from "@blazetrails/ruby-compat";\ndeclare const xs: { a: number }[]; uniq(xs);',
      filename,
    },
    {
      code: 'import { uniq } from "@blazetrails/ruby-compat";\ndeclare const xs: (string | number[])[]; uniq(xs);',
      filename,
    },
    {
      code: 'import { hashDelete } from "./elsewhere";\ndeclare const h: Record<string, number>; hashDelete(h, "a");',
      filename,
    },
  ],
  invalid: [
    // plain objects
    invalid("declare const h: Record<string, number>; hashDelete(h, 'a');"),
    invalid("declare const h: { [k: string]: number }; hashDelete(h, 'a');"),
    invalid("declare const h: { a?: number }; hashDelete(h, 'a');"),
    invalid("declare const h: { a: number } | undefined; hashDelete(h!, 'a');"),
    // arrays, strings, numbers
    invalid("declare const xs: string[]; hashDelete(xs, 0);"),
    invalid("declare const t: [number, string]; hashDelete(t, 0);"),
    invalid("hashDelete('abc' as unknown as string, 'length');"),
    invalid("hashDelete(1 as unknown as number, 'a');"),
  ],
});

/** Every helper the list has ever held. Only-grow: a sweep appends its
 *  helpers here and to the JSON in the same PR. */
const LISTED_FLOOR = [
  "hashDelete",
  "aryIncludes",
  "aryJoin",
  "compact",
  "max",
  "min",
  "round",
  "toI",
  "union",
  "uniq",
];

describe("ruby-compat-native-required fixture project", () => {
  it("resolves its lib, so the dispatching-receiver cases are not vacuous", () => {
    const ts = parseFixture(
      "declare const m: Map<string, number>; declare const r: Record<string, number>; declare const xs: string[]; m; r; xs;",
    );
    const checker = ts.services.program.getTypeChecker();
    const types = ts.ast.body
      .slice(-3)
      .map((stmt) =>
        checker.getTypeAtLocation(ts.services.esTreeNodeToTSNodeMap.get(stmt.expression)),
      );
    expect(types.map((t) => checker.typeToString(t))).toEqual([
      "Map<string, number>",
      "Record<string, number>",
      "string[]",
    ]);
    expect(types.every((t) => (t.flags & 1) === 0)).toBe(true);
    expect(checker.isArrayType(types[2])).toBe(true);
  });
});

describe("ruby-compat-native-required.json", () => {
  it("never drops a helper while ruby-compat still exports it", async () => {
    const listed = JSON.parse(
      fs.readFileSync(path.join(__dirname, "ruby-compat-native-required.json"), "utf8"),
    );
    const compat = await import("../packages/ruby-compat/src/index.ts");
    const dropped = LISTED_FLOOR.filter((h) => h in compat && !Object.hasOwn(listed, h));
    expect(dropped).toEqual([]);
  });

  it("lists only ruby-compat exports, each with a member and a native form", async () => {
    const listed = JSON.parse(
      fs.readFileSync(path.join(__dirname, "ruby-compat-native-required.json"), "utf8"),
    );
    const compat = await import("../packages/ruby-compat/src/index.ts");
    for (const [helper, entry] of Object.entries(listed)) {
      expect(typeof compat[helper], helper).toBe("function");
      expect(entry.member, helper).toBeTypeOf("string");
      expect(entry.native, helper).toBeTypeOf("string");
    }
  });
});
