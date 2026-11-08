import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  classKey,
  collectBaseDescendants,
} from "../../lib/type-virtualization/transitive-extends-walker.js";

describe("collectBaseDescendants", () => {
  test("skips ActiveJob's Base and records superclasses of models", () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "walker-")));
    const write = (file: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    };
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { module: "nodenext", noEmit: true }, include: ["*.ts"] }),
    );
    write(
      "node_modules/@blazetrails/activejob/package.json",
      JSON.stringify({ name: "@blazetrails/activejob", types: "index.d.ts" }),
    );
    write("node_modules/@blazetrails/activejob/index.d.ts", "export declare class Base {}\n");
    write(
      "job.ts",
      `import { Base } from "@blazetrails/activejob";\nexport class ApplicationJob extends Base {}\nexport class SyncJob extends ApplicationJob {}\n`,
    );
    write(
      "model.ts",
      `class Base {}\nexport class Record extends Base {}\nexport class Post extends Record {}\n`,
    );
    const { baseNames, superKeys } = collectBaseDescendants(path.join(dir, "tsconfig.json"));
    expect(baseNames.has("ApplicationJob")).toBe(false);
    expect(baseNames.has("SyncJob")).toBe(false);
    const model = path.join(dir, "model.ts");
    expect(superKeys.get(classKey(model, "Post"))).toBe(classKey(model, "Record"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("keys same-named intermediates by file, so each keeps its own parent", () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "walker-")));
    const write = (file: string, text: string) => fs.writeFileSync(path.join(dir, file), text);
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { module: "nodenext", noEmit: true }, include: ["*.ts"] }),
    );
    write(
      "base.ts",
      `export class Base {}\nexport class Hub extends Base {}\nexport class Stats extends Base {}\n`,
    );
    write(
      "a.ts",
      `import { Hub } from "./base.js";\nexport class Record extends Hub {}\nexport class A extends Record {}\n`,
    );
    write(
      "b.ts",
      `import { Stats } from "./base.js";\nexport class Record extends Stats {}\nexport class B extends Record {}\n`,
    );
    const { superKeys } = collectBaseDescendants(path.join(dir, "tsconfig.json"));
    const file = (f: string) => path.join(dir, f);
    expect(superKeys.get(classKey(file("a.ts"), "Record"))).toBe(classKey(file("base.ts"), "Hub"));
    expect(superKeys.get(classKey(file("b.ts"), "Record"))).toBe(
      classKey(file("base.ts"), "Stats"),
    );
    expect(superKeys.get(classKey(file("b.ts"), "B"))).toBe(classKey(file("b.ts"), "Record"));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
