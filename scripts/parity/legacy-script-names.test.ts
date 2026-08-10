import { describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  ALLOWED_PATHS,
  LEGACY_SCRIPT_NAMES,
  SKIPPED_DIRS,
  findLegacyScriptNames,
  isAliasDefinition,
  scanText,
} from "./legacy-script-names.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Assembled the same way the token list is, so this file is not itself a hit.
const spell = (...parts: string[]): string => parts.join(":");

describe("legacy compare-script name gate", () => {
  it("flags a retired spelling in a comment", () => {
    const token = spell("api", "compare");
    const hits = scanText(`// run \`pnpm ${token}\` first\n`);
    expect(hits).toEqual([{ line: 1, token, text: `// run \`pnpm ${token}\` first` }]);
  });

  it("flags each of the retired spellings", () => {
    for (const token of LEGACY_SCRIPT_NAMES) {
      expect(scanText(`pnpm ${token}`).map((h) => h.token)).toContain(token);
    }
  });

  it("passes the parity:-prefixed forms, whose tails are the legacy names", () => {
    const current = [
      spell("parity", "api", "compare"),
      spell("parity", "api", "calls"),
      spell("parity", "api", "calls", "report"),
      spell("parity", "test", "compare"),
      spell("parity", "schema", "compare"),
      spell("parity", "fixtures", "compare"),
    ];
    expect(scanText(current.join("\n"))).toEqual([]);
  });

  it("passes the compare directory names, which carry no colon", () => {
    expect(scanText("scripts/api-compare/compare.ts scripts/test-compare/compare.ts")).toEqual([]);
  });

  it("passes an alias definition line in the root package.json only", () => {
    const line = `    "${spell("api", "extra")}": "pnpm ${spell("parity", "api", "extra")}",`;
    expect(isAliasDefinition("package.json", line)).toBe(true);
    expect(isAliasDefinition("packages/date/package.json", line)).toBe(false);
    expect(isAliasDefinition("package.json", `// see pnpm ${spell("api", "extra")}`)).toBe(false);
  });

  it("skips the sibling tasks repo and every symlink, so CI sees this population", async () => {
    // `tasks/` is a symlink in a worktree and a real directory on the runner.
    // Leaving that to chance is what let 3813 story-body references pass here
    // and fail in CI.
    expect(SKIPPED_DIRS).toContain("tasks");

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trails-legacy-names-"));
    try {
      // A REAL tasks/ directory, which is what the runner has.
      await fs.mkdir(path.join(root, "tasks"));
      await fs.writeFile(path.join(root, "tasks", "story.md"), `pnpm ${spell("api", "compare")}\n`);
      // A symlinked one, which is what a worktree has.
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), "trails-legacy-names-out-"));
      await fs.writeFile(path.join(outside, "note.md"), `pnpm ${spell("api", "compare")}\n`);
      await fs.symlink(outside, path.join(root, "linked"));

      expect(await findLegacyScriptNames(root)).toEqual([]);
      // ...and the same text IS a hit when it is genuinely in the population.
      expect((await findLegacyScriptNames(outside)).map((h) => h.file)).toEqual(["note.md"]);
      await fs.rm(outside, { recursive: true, force: true });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("allowlists exactly the three intentional mentions", () => {
    expect([...ALLOWED_PATHS.keys()]).toEqual([
      "CLAUDE.md",
      "scripts/parity/README.md",
      "docs/infrastructure/prism-codegen-spike.md",
    ]);
  });

  it("finds no reintroduced spelling in the tree", async () => {
    const hits = await findLegacyScriptNames(ROOT_DIR);
    expect(hits.map((h) => `${h.file}:${h.line} ${h.token}`)).toEqual([]);
  }, 60_000);
});
