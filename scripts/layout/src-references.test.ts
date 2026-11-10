import { execFile } from "child_process";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

import {
  GENERIC_RESOLVER_PATTERNS,
  localSrcReferences,
  markdownSrcReferencePattern,
  srcReferencePattern,
  srcReferences,
} from "./src-references.js";

const run = promisify(execFile);
const generic = (line: string) => GENERIC_RESOLVER_PATTERNS.some((p) => new RegExp(p).test(line));

describe("src-references", () => {
  it("matches a bare <pkg>/src/ citation in markdown", () => {
    const re = new RegExp(markdownSrcReferencePattern("actionmailer"));
    expect(re.test("see `actionmailer/src/base.ts`")).toBe(true);
    expect(re.test("see x-actionmailer/src/base.ts")).toBe(false);
    expect(re.test("see actionmailer/lib/base.ts")).toBe(false);
  });

  it("reports a markdown hit outside vendor/", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "src-references-"));
    await mkdir(path.join(dir, "vendor"));
    await writeFile(path.join(dir, "README.md"), "see `actioncable/src/connection/base.ts`\n");
    await writeFile(path.join(dir, "vendor", "x.md"), "actioncable/src/x.ts\n");
    await writeFile(path.join(dir, "notes.txt"), "actioncable/src/x.ts\n");
    await run("git", ["init", "-q"], { cwd: dir });
    await run("git", ["add", "."], { cwd: dir });
    expect(await srcReferences("actioncable", dir)).toEqual([
      "README.md:1:see `actioncable/src/connection/base.ts`",
    ]);
  });

  it("matches a package's src behind a relative prefix", () => {
    const re = new RegExp(srcReferencePattern("ruby-compat"));
    expect(re.test('"@blazetrails/ruby-compat/*": ["../../ruby-compat/src/*"]')).toBe(true);
    expect(re.test('"../ruby-compat/lib/*"')).toBe(false);
  });

  it("reports each generic resolver shape", () => {
    expect(generic("const entry = `${root}/${name}/src/index.ts`;")).toBe(true);
    expect(generic('return file.replace("/dist/", "/src/");')).toBe(true);
    expect(generic("const m = /packages\\/([^/]+)\\/src\\//.exec(testPath);")).toBe(true);
    expect(generic('import { libRoot } from "../layout/package-roots.mjs";')).toBe(false);
  });

  it("reports package-local src/ paths in package.json scripts", () => {
    const pkg = JSON.stringify(
      {
        name: "@blazetrails/mini-mime",
        scripts: {
          "build:db": "cp -R src/db dist/",
          "build:templates":
            "node -e \"cpSync('src/generators/install/templates', 'dist/generators/install/templates')\"",
          build: "tsc -p lib",
        },
      },
      null,
      2,
    );
    expect(localSrcReferences("packages/mini-mime/package.json", pkg)).toEqual([
      'packages/mini-mime/package.json:4:    "build:db": "cp -R src/db dist/",',
      `packages/mini-mime/package.json:5:    "build:templates": "node -e \\"cpSync('src/generators/install/templates', 'dist/generators/install/templates')\\"",`,
    ]);
  });
});
