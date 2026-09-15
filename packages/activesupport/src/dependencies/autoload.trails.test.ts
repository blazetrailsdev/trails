import { readFile } from "fs/promises";
import ts from "typescript";
import { extend } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import * as Autoload from "./autoload.js";

describe("ActiveSupport::Autoload registry", () => {
  it("has no runtime imports", async () => {
    const source = await readFile(new URL("./autoload.ts", import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    const file = ts.createSourceFile("autoload.js", outputText, ts.ScriptTarget.ES2022);
    const staticImports = file.statements.filter(
      (s) => ts.isImportDeclaration(s) || (ts.isExportDeclaration(s) && s.moduleSpecifier),
    );
    expect(staticImports).toEqual([]);
  });
});

describe("ActiveSupport::Autoload#autoload on a bound name", () => {
  const define = () => {
    const mod = { name: "M", loadPath: {} } as Autoload.Autoload &
      Record<string, unknown> & { autoload(constName: string, path?: string | null): void };
    extend(mod, Autoload);
    return mod;
  };

  it("does not replace an already-defined constant", async () => {
    const mod = define();
    mod.X = 1;
    mod.autoload("X", "nope");
    expect(mod.X).toBe(1);
    expect(mod._autoloads?.X).toBeUndefined();
  });

  it("keeps a seated constant when registered again", async () => {
    const mod = define();
    mod.autoload("Y", "a");
    mod.Y = 2;
    mod.autoload("Y", "b");
    expect(mod.Y).toBe(2);
    expect(await mod._autoloads!.Y()).toBe("a");
  });

  it("repoints an unloaded registration at the new path", async () => {
    const mod = define();
    mod.autoload("Z", "a");
    mod.autoload("Z", "b");
    expect(await mod._autoloads!.Z()).toBe("b");
  });
});
