// Pins the ESM premise CLAUDE.md § "Call-time constant resolution" rests on
// (RFC 0205, story pin-the-esm-deferred-read-premise-in-ci): an import binding
// is live, so a read inside a function or method body resolves at call time
// even inside a cycle, while a read evaluated during module evaluation TDZs
// when the cycle is entered from the side that evaluates first.
//
// Each case runs in a child `node` over plain `.mjs` files: vitest's module
// runner rewrites imports into property reads and would mask the TDZ. The
// sibling `*-entry-import-tdz` tests check real package graphs; this one checks
// only the language rule, against a two-module cycle and no package build.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const TDZ = "Cannot access 'Val' before initialization";

// `a.mjs` imports `Val` from `b.mjs`, and `b.mjs` imports `a.mjs` back.
// Entering at `b.mjs` evaluates `a.mjs` first, with `Val` still in TDZ.
const moduleEvalShapes = [
  {
    bullet: /^an `extends` clause/,
    shape: "extends clause",
    body: "export class A extends Val {}",
  },
  {
    bullet: /^a \*\*static field initializer\*\*/,
    shape: "static field initializer",
    body: "export class A { static seated = Val; }",
  },
  {
    bullet: /^a top-level call/,
    shape: "top-level call",
    body: "function include(klass) { return klass; }\ninclude(Val);",
  },
  {
    bullet: /^a top-level `new` or `const`/,
    shape: "top-level new or const",
    body: "export const seated = new Val();",
  },
];

const deferredShapes = [
  {
    shape: "method body",
    body: "export function probe() { return new A().read(); }\nclass A { read() { return Val.name; } }",
  },
  {
    shape: "instance field initializer",
    body: "export function probe() { return new A().seated.name; }\nclass A { seated = Val; }",
  },
];

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "esm-deferred-read-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function enter(name: string, aBody: string, entry: "a" | "b") {
  const caseDir = await mkdtemp(join(dir, `${name.replace(/\W+/g, "-")}-`));
  await writeFile(join(caseDir, "a.mjs"), `import { Val } from "./b.mjs";\n${aBody}\n`);
  await writeFile(
    join(caseDir, "b.mjs"),
    `import * as a from "./a.mjs";\nexport class Val {}\nexport { a };\n`,
  );
  await writeFile(
    join(caseDir, "main.mjs"),
    [
      "try {",
      `  await import(${JSON.stringify(pathToFileURL(join(caseDir, `${entry}.mjs`)).href)});`,
      '  const a = await import("./a.mjs");',
      "  console.log(JSON.stringify({ ok: true, read: a.probe ? a.probe() : null }));",
      "} catch (e) {",
      "  console.log(JSON.stringify({ ok: false, name: e.name, message: e.message }));",
      "}",
    ].join("\n"),
  );
  const { stdout } = await run("node", [join(caseDir, "main.mjs")]);
  return JSON.parse(stdout) as { ok: boolean; read?: string; name?: string; message?: string };
}

describe("ESM deferred-read premise", () => {
  it("names the four module-eval shapes CLAUDE.md lists", async () => {
    const claude = (await readFile(new URL("../../CLAUDE.md", import.meta.url), "utf8")).replace(
      /\s+/g,
      " ",
    );
    const start = claude.indexOf("a class body is two of them:");
    const end = claude.indexOf("When such an edge closes a cycle");
    const bullets = claude
      .slice(start, end)
      .split(" - ")
      .slice(1)
      .map((b) => b.trim());
    expect(bullets).toHaveLength(moduleEvalShapes.length);
    moduleEvalShapes.forEach(({ bullet }, i) => expect(bullets[i]).toMatch(bullet));
  });

  for (const { shape, body } of moduleEvalShapes) {
    it(`a read in a ${shape} throws when the cycle is entered from the side that evaluates first`, async () => {
      expect(await enter(shape, body, "b")).toEqual({
        ok: false,
        name: "ReferenceError",
        message: TDZ,
      });
    });

    it(`a read in a ${shape} resolves when the cycle is entered from its own module`, async () => {
      expect((await enter(shape, body, "a")).ok).toBe(true);
    });
  }

  for (const { shape, body } of deferredShapes) {
    for (const entry of ["a", "b"] as const) {
      it(`a read in a ${shape} resolves at call time entering at ${entry}.mjs`, async () => {
        expect(await enter(shape, body, entry)).toEqual({ ok: true, read: "Val" });
      });
    }
  }
});
