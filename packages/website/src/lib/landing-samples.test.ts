import { describe, expect, it } from "vitest";
import ts from "typescript-5";
import * as fs from "fs/promises";
import * as path from "path";
import {
  buildViews,
  chainLineMappings,
  createPlainProgram,
  decodeLineMappings,
} from "@blazetrails/trails-tsc";
import { REPO_ROOT } from "./parity.js";
import { check, checkError, squiggle, view, viewError } from "./landing-samples.js";

const EXAMPLE_ROOT = path.resolve(REPO_ROOT, "examples/homepage");

async function compile(edits: Record<string, string>): Promise<string[]> {
  const cwd = await fs.mkdtemp(path.join(EXAMPLE_ROOT, ".landing-"));
  try {
    await fs.cp(path.join(EXAMPLE_ROOT, "app"), path.join(cwd, "app"), { recursive: true });
    for (const [rel, body] of Object.entries(edits)) await fs.writeFile(path.join(cwd, rel), body);
    await fs.writeFile(
      path.join(cwd, "tsconfig.json"),
      JSON.stringify({ extends: "../tsconfig.json", include: ["app", ".trails/views"] }),
    );
    await buildViews({ cwd });
    const { program, configDiagnostics } = createPlainProgram(cwd);
    const diagnostics = [...configDiagnostics, ...ts.getPreEmitDiagnostics(program)];
    const shown = Object.keys(edits);
    const reported = await Promise.all(diagnostics.map((d) => format(d, cwd)));
    return shown.length === 0
      ? reported
      : reported.filter((r) => shown.some((f) => r.startsWith(`${f}(`)));
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

async function format(d: ts.Diagnostic, cwd: string): Promise<string> {
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (!d.file || d.start == null) return `error TS${d.code}: ${message}`;
  let { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  let rel = path.relative(cwd, d.file.fileName);
  const shim = /^\.trails\/views\/(.+)\.ts$/u.exec(rel);
  if (shim) {
    const map = JSON.parse(await fs.readFile(d.file.fileName + ".map", "utf8"));
    const [src] = chainLineMappings(
      [{ genLine: 0, genCol: 0, srcLine: line, srcCol: character }],
      decodeLineMappings(map.mappings),
    );
    ({ srcLine: line, srcCol: character } = src);
    rel = `app/views/${shim[1]}`;
  }
  return `${rel}(${line + 1},${character + 1}): error TS${d.code}: ${message}`;
}

describe("landing page samples", { timeout: 120_000 }, () => {
  it("compiles the feature-block example app cleanly", async () => {
    expect(await compile({})).toEqual([
      // view-type-includes-engine-helpers
      "app/views/posts/show.html.tse(1,5): error TS2349: This expression is not callable.\n  Type 'never' has no call signatures.",
      // attached-one-types-delegated-attachment-members
      "app/views/posts/show.html.tse(4,32): error TS2339: Property 'variant' does not exist on type 'One'.",
    ]);
  });

  it("reports the controller sample's diagnostic as shown", async () => {
    expect(await compile({ "app/controllers/posts-controller.ts": check })).toEqual([checkError]);
    expect(squiggle(checkError)).toEqual({ line: 7, from: 15, to: 22 });
  });

  it("reports the view sample's diagnostic as shown", async () => {
    expect(await compile({ "app/views/posts/show.html.tse": view })).toEqual([viewError]);
    expect(squiggle(viewError)).toEqual({ line: 2, from: 15, to: 20 });
  });
});
