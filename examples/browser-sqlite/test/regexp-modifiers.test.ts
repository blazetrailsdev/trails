import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript-5";
import { describe, expect, it } from "vitest";
import { rewriteModifiers } from "../src/runtime/regexp-modifiers.ts";

const same = (pattern: string, inputs: string[]) => {
  const native = new RegExp(pattern);
  const rewritten = new RegExp(rewriteModifiers(pattern));
  for (const input of inputs)
    expect([input, rewritten.test(input)]).toEqual([input, native.test(input)]);
};

describe("rewriteModifiers", () => {
  it("writes a group's i into its source", () => {
    expect(rewriteModifiers("(?i-ms:sel)")).toBe("(?:[sS][eE][lL])");
    same("^(?:[(\\s]|(?-ims:--.*\\n))*(?-ims:(?i-ms:pragma)|(?i-ms:select))", [
      "SELECT 1",
      "-- c\nPragma x",
      "insert",
    ]);
  });

  it("does not fold a group nested in an i group that turns i off", () => {
    expect(rewriteModifiers("(?i-ms:a(?-ims:b))")).toBe("(?:[aA](?:b))");
    same("(?i-ms:a(?-ims:b))", ["ab", "Ab", "aB", "AB"]);
  });

  it("folds letter escapes and ASCII letter ranges", () => {
    expect(rewriteModifiers("(?i:\\x41[a-c\\u0064])")).toBe("(?:[\\x41a][a-cA-C\\u0064D])");
    same("(?i:\\x41[a-c\\u0064])", ["aD", "Ab", "ce", "xx"]);
  });

  it("writes a group's s into its source", () => {
    expect(rewriteModifiers("(?s:a.[.])")).toBe("(?:a[^][.])");
    same("(?s:a.b)", ["a\nb", "axb"]);
  });

  it("leaves escapes, group names and quantifiers alone", () => {
    expect(rewriteModifiers("(?i:\\d\\p{L}(?<na>a){2,3}\\k<na>)")).toBe(
      "(?:\\d\\p{L}(?<na>[aA]){2,3}\\k<na>)",
    );
  });

  it("leaves a pattern with no modifier group unchanged", () => {
    expect(rewriteModifiers("(?:a)(?=b)(?<!c)[(?i:]\\(?i:x")).toBe("(?:a)(?=b)(?<!c)[(?i:]\\(?i:x");
  });
});

describe("regex literals", () => {
  it("no package source holds a modifier group in a regex literal", () => {
    const root = join(import.meta.dirname, "../../../packages");
    const offenders: string[] = [];
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== "dist") visit(path);
        } else if (/\.[cm]?[jt]s$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
          const text = readFileSync(path, "utf8");
          if (!text.includes("(?")) continue;
          const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest);
          const walk = (node: ts.Node): void => {
            if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
              const literal = node.getText(file);
              const body = literal.slice(1, literal.lastIndexOf("/"));
              if (rewriteModifiers(body) !== body) offenders.push(`${path}: ${literal}`);
            }
            ts.forEachChild(node, walk);
          };
          walk(file);
        }
      }
    };
    for (const pkg of readdirSync(root)) {
      for (const dir of ["lib", "src"]) {
        try {
          visit(join(root, pkg, dir));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
