import { readFile } from "fs/promises";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("ActiveSupport::Autoload registry", () => {
  it("has no runtime imports", async () => {
    const source = await readFile(new URL("./autoload.ts", import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    expect(ts.preProcessFile(outputText, true, true).importedFiles).toEqual([]);
  });
});
