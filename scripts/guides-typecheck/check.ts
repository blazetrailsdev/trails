/**
 * Type-check TypeScript code blocks in website guides.
 *
 * Walks `packages/website/docs/guides/**\/*.md`, extracts every
 * ```ts / ```typescript fenced block, injects a preamble that
 * declares common illustrative names (user, post, User, Post, etc.)
 * so short snippets don't need boilerplate, and compiles each block
 * with `tsc --noEmit` against real @blazetrails/* types.
 *
 * Blocks preceded by an HTML comment `<!-- typecheck:skip -->` on
 * the immediately preceding non-blank line are skipped.
 *
 * Exit code is non-zero if any block fails to compile.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const GUIDES_DIR = path.join(REPO_ROOT, "packages/website/docs/guides");
const TSC = path.join(
  REPO_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

/**
 * Ambient declarations shared across all blocks. Written once as a
 * .d.ts file so they don't conflict when multiple blocks are compiled
 * together.
 */
const GLOBALS_DTS = `
declare global {
  const user: any;
  const post: any;
  const comment: any;
  const tx: any;
  const User: any;
  const Post: any;
  const Comment: any;
  type AnyRecord = any;
}
export {};
`.trimStart();

const BLOCK_SUFFIX = "\nexport {};\n";

export interface Block {
  file: string;
  startLine: number;
  code: string;
  skip: boolean;
}

interface UntaggedBlock {
  file: string;
  line: number;
}

interface ExtractResult {
  blocks: Block[];
  untagged: UntaggedBlock[];
}

export function extractBlocks(filePath: string, content: string): ExtractResult {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  const untagged: UntaggedBlock[] = [];
  let inBlock = false;
  let blockStart = 0;
  let blockLines: string[] = [];
  let blockSkip = false;
  let blockIsTs = false;
  let blockIndent = 0;
  let blockFence = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock) {
      // CommonMark: fences use 3+ backticks (or tildes); opener and
      // closer must share the same char and the closer length >= opener.
      // We only handle backtick fences — guides don't use tilde fences.
      // Fences may be indented up to 3 spaces per CommonMark; real
      // guides nest under list items at deeper indents, so we accept
      // any leading whitespace. The language is the first
      // whitespace-separated token after the fence.
      const openMatch = /^(\s*)(`{3,})(.*)$/.exec(line);
      if (openMatch) {
        const indent = openMatch[1].length;
        const fence = openMatch[2];
        const info = openMatch[3].trim();
        const lang = info.split(/\s+/)[0] ?? "";
        if (!lang) {
          untagged.push({ file: filePath, line: i + 1 });
        }
        inBlock = true;
        blockStart = i + 2;
        blockLines = [];
        blockSkip = false;
        blockIsTs = lang === "ts" || lang === "typescript";
        blockIndent = indent;
        blockFence = fence;
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j].trim();
          if (prev === "") continue;
          if (prev.includes("<!-- typecheck:skip -->")) blockSkip = true;
          break;
        }
      }
    } else {
      // Closer: same fence char, length >= opener, nothing but
      // whitespace after.
      const closeMatch = /^(\s*)(`{3,})\s*$/.exec(line);
      const isCloser = closeMatch !== null && closeMatch[2].length >= blockFence.length;
      if (isCloser) {
        if (blockIsTs) {
          blocks.push({
            file: filePath,
            startLine: blockStart,
            code: blockLines.join("\n"),
            skip: blockSkip,
          });
        }
        inBlock = false;
      } else {
        // Strip up to `blockIndent` leading spaces from each content
        // line, matching how Markdown renderers reconstruct the block.
        const strippedLine =
          blockIndent > 0 && line.startsWith(" ".repeat(blockIndent))
            ? line.slice(blockIndent)
            : line;
        blockLines.push(strippedLine);
      }
    }
  }
  if (inBlock) {
    throw new Error(
      `Unterminated fenced code block in ${filePath} starting at line ${blockStart - 1}.`,
    );
  }
  return { blocks, untagged };
}

function validatePackageCoverage(): void {
  const packagesDir = path.join(REPO_ROOT, "packages");
  const discovered: string[] = [];
  for (const entry of fs.readdirSync(packagesDir)) {
    const pkgJsonPath = path.join(packagesDir, entry, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
      name?: string;
      private?: boolean;
    };
    if (!pkg.name || !pkg.name.startsWith("@blazetrails/")) continue;
    discovered.push(pkg.name);
  }

  const selfPkgPath = path.join(SCRIPT_DIR, "package.json");
  const self = JSON.parse(fs.readFileSync(selfPkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const declared = new Set(Object.keys(self.dependencies ?? {}));
  const missing = discovered.filter(
    (name) => !declared.has(name) && name !== "@blazetrails/website",
  );
  if (missing.length > 0) {
    console.error(`✗ scripts/guides-typecheck/package.json is missing workspace deps for:`);
    for (const m of missing) console.error(`  ${m}`);
    console.error(`Add them as "workspace:*" so guide code blocks can import them, then re-run.`);
    process.exit(1);
  }
}

/**
 * Rewrite tsc diagnostic locations so they point back at the source
 * guide file and absolute line number. Handles both `foo.ts(L,C):`
 * (tsc's default) and `foo.ts:L:C:` (tsc --pretty) forms.
 */
export function remapDiagnostics(
  output: string,
  blocksByIdx: Map<number, Block>,
  repoRoot: string,
): string {
  // Matches both `path/blocks/<name>__L<start>__<idx>.ts(L,C)` and
  // `path/blocks/<name>__L<start>__<idx>.ts:L:C`. `:L:C` is captured as
  // groups 5/6; `(L,C)` as groups 7/8. Either group pair may be undefined.
  const pattern =
    /(?:[^\n]*?[\/\\])?blocks[\/\\]([^\n]*?)__L(\d+)__(\d+)\.ts(?::(\d+):(\d+)|\((\d+),(\d+)\))?/g;
  return output.replace(
    pattern,
    (match, _name, _startStr, idxStr, colonL, colonC, parenL, parenC) => {
      const block = blocksByIdx.get(parseInt(idxStr, 10));
      if (!block) return match;
      const lineOffsetStr = colonL ?? parenL;
      const colStr = colonC ?? parenC;
      const guide = path.relative(repoRoot, block.file);
      if (!lineOffsetStr) return guide;
      const absoluteLine = block.startLine + parseInt(lineOffsetStr, 10) - 1;
      return colStr ? `${guide}:${absoluteLine}:${colStr}` : `${guide}:${absoluteLine}`;
    },
  );
}

function writeTsconfig(tmpDir: string): string {
  const tsconfigPath = path.join(tmpDir, "tsconfig.json");
  // Extend the root tsconfig so guide snippets type-check under
  // exactly the same compilerOptions as the real packages.
  // Manually-duplicated options drift; inheriting is safer.
  const rootTsconfig = path.join(REPO_ROOT, "tsconfig.json");
  const config = {
    extends: path.relative(tmpDir, rootTsconfig),
    compilerOptions: {
      noEmit: true,
      // Override settings incompatible with a one-off check. rootDir
      // and outDir from the root don't matter here because noEmit is
      // true, so we leave them inherited.
      composite: false,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
    },
    include: ["globals.d.ts", "blocks/**/*.ts"],
    // Root uses `references`; we're a leaf check, clear it.
    references: [],
  };
  fs.writeFileSync(tsconfigPath, JSON.stringify(config, null, 2));
  return tsconfigPath;
}

function main(): void {
  if (!fs.existsSync(GUIDES_DIR)) {
    console.error(`Guides directory not found: ${GUIDES_DIR}`);
    process.exit(1);
  }

  validatePackageCoverage();

  const mdFiles: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) mdFiles.push(full);
    }
  };
  walk(GUIDES_DIR);

  const allBlocks: Block[] = [];
  const allUntagged: UntaggedBlock[] = [];
  for (const file of mdFiles) {
    const { blocks, untagged } = extractBlocks(file, fs.readFileSync(file, "utf8"));
    allBlocks.push(...blocks);
    allUntagged.push(...untagged);
  }

  if (allUntagged.length > 0) {
    console.error("✗ Found fenced code blocks without a language tag:");
    for (const u of allUntagged) {
      console.error(`  ${path.relative(REPO_ROOT, u.file)}:${u.line}`);
    }
    console.error("Every fenced block in a guide must declare its language (e.g. ```ts, ```sh).");
    process.exit(1);
  }

  const checked = allBlocks.filter((b) => !b.skip);
  const skipped = allBlocks.length - checked.length;

  if (checked.length === 0) {
    console.log(
      `No TypeScript code blocks to check. (${allBlocks.length} total, ${skipped} skipped.)`,
    );
    return;
  }

  const tmpParent = path.join(SCRIPT_DIR, ".tmp");
  fs.mkdirSync(tmpParent, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(tmpParent, "run-"));
  const blocksDir = path.join(tmpRoot, "blocks");
  fs.mkdirSync(blocksDir);
  fs.writeFileSync(path.join(tmpRoot, "globals.d.ts"), GLOBALS_DTS);
  writeTsconfig(tmpRoot);

  const blocksByIdx = new Map<number, Block>();
  checked.forEach((block, idx) => {
    const rel = path.relative(REPO_ROOT, block.file).replace(/[^\w]/g, "_");
    const tmpName = `${rel}__L${block.startLine}__${idx}.ts`;
    const tmpPath = path.join(blocksDir, tmpName);
    fs.writeFileSync(tmpPath, block.code + BLOCK_SUFFIX);
    blocksByIdx.set(idx, block);
  });

  console.log(
    `Type-checking ${checked.length} code block${checked.length === 1 ? "" : "s"} from ${mdFiles.length} guide${mdFiles.length === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}…`,
  );

  // --pretty false forces the classic `file.ts(L,C):` diagnostic format
  // so remapDiagnostics has a stable input to rewrite.
  const result = spawnSync(TSC, ["-p", path.join(tmpRoot, "tsconfig.json"), "--pretty", "false"], {
    encoding: "utf8",
  });

  if (result.error) {
    console.error(`✗ Failed to start TypeScript compiler.`);
    console.error(`  TSC: ${TSC}`);
    console.error(`  cwd: ${process.cwd()}`);
    console.error(`  ${result.error.name}: ${result.error.message}`);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    process.exit(1);
  }

  const output = (result.stdout ?? "") + (result.stderr ?? "");
  if (result.status === 0) {
    console.log(`✓ All ${checked.length} code blocks type-check cleanly.`);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    return;
  }

  console.error(remapDiagnostics(output, blocksByIdx, REPO_ROOT));
  console.error(`✗ Guide code block type-check failed.`);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

const isMainEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainEntrypoint) main();
