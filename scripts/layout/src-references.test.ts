import { execFile } from "child_process";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

import { markdownSrcReferencePattern, srcReferences } from "./src-references.js";

const run = promisify(execFile);

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
});
