import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectBaseDescendants } from "./transitive-extends-walker.js";

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
    const { baseNames, superNames } = collectBaseDescendants(path.join(dir, "tsconfig.json"));
    expect(baseNames.has("ApplicationJob")).toBe(false);
    expect(baseNames.has("SyncJob")).toBe(false);
    expect(superNames.get("Post")).toBe("Record");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
