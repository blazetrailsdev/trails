/**
 * ESLint rule: rails-file-structure-method-order
 *
 * Method-order slice of the rails-file-structure rule family
 * (docs/rails-file-structure-mirror-plan.md). Enforces that class
 * members and top-level functions appear in the same source order as
 * their Rails counterparts. The manifest is generated from
 * rails-api.json:
 *   pnpm tsx scripts/build-rails-file-structure-manifest.ts
 *
 * Scope per file:
 *   - Class instance + static methods (one container per ClassBody).
 *   - Top-level FunctionDeclaration (incl. `export function …`).
 *
 * The manifest provides a single flat expected order per file. For each
 * container, the rule filters expected names to those present in that
 * container; the relative order between mapped names must match. Names
 * not in the manifest (TS-only helpers) preserve their relative order
 * after the mapped block.
 *
 * Autofix carries leading JSDoc / line comments with each declaration
 * (a comment is attached if it ends on the line immediately preceding
 * the next attached comment or the declaration itself).
 *
 * Reporting is one diagnostic per file with a whole-file autofix.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, "rails-file-structure-method-order.json");

let manifestCache = null;
function loadManifest() {
  if (manifestCache) return manifestCache;
  if (!fs.existsSync(MANIFEST_PATH)) {
    manifestCache = { files: {} };
    return manifestCache;
  }
  manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  return manifestCache;
}

let repoRootCache = null;
function repoRoot() {
  if (repoRootCache) return repoRootCache;
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      repoRootCache = dir;
      return dir;
    }
    dir = path.dirname(dir);
  }
  repoRootCache = process.cwd();
  return repoRootCache;
}

function relFromRepoRoot(filename) {
  return path.relative(repoRoot(), filename).split(path.sep).join("/");
}

function extendedStart(node, sourceCode) {
  // Walk leading comments backwards. A comment attaches to `node` if
  // (a) it sits on the line immediately above the previous start, or
  // (b) it's separated by exactly one blank line — this catches the
  //     common `// section header` + blank + def pattern (and JSDoc +
  //     blank + def). Two or more blank lines breaks attachment, as
  //     does any non-comment token between.
  const comments = sourceCode.getCommentsBefore(node);
  let attachedStart = node.range[0];
  let prevLine = node.loc.start.line;
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (!c.loc) break;
    const gap = prevLine - 1 - c.loc.end.line;
    if (gap < 0 || gap > 1) break;
    const tokenBetween = sourceCode.getTokenAfter(c, { includeComments: false });
    if (
      tokenBetween &&
      tokenBetween.range[0] < node.range[0] &&
      tokenBetween.range[0] >= c.range[1]
    ) {
      break;
    }
    attachedStart = c.range[0];
    prevLine = c.loc.start.line;
  }
  // Pull in any leading indentation on the comment / declaration's line
  // so block text is self-contained.
  const text = sourceCode.getText();
  let i = attachedStart - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\t")) i--;
  return i + 1;
}

function blockText(node, sourceCode) {
  const start = extendedStart(node, sourceCode);
  return {
    start,
    end: node.range[1],
    text: sourceCode.getText().slice(start, node.range[1]),
  };
}

function memberName(node) {
  // MethodDefinition / PropertyDefinition.
  if (node.type === "MethodDefinition" || node.type === "PropertyDefinition") {
    if (node.key?.type !== "Identifier") return null;
    if (node.key.name === "constructor") return "constructor";
    return node.key.name;
  }
  // FunctionDeclaration (incl. as child of ExportNamedDeclaration).
  if (node.type === "FunctionDeclaration") return node.id?.name ?? null;
  if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "FunctionDeclaration") {
    return node.declaration.id?.name ?? null;
  }
  return null;
}

function isOrderableClassMember(node) {
  if (node.type !== "MethodDefinition") return false;
  if (node.key?.type !== "Identifier") return false;
  return true;
}

function isOrderableTopLevel(node) {
  if (node.type === "FunctionDeclaration") return !!node.id;
  if (node.type === "ExportNamedDeclaration" && node.declaration?.type === "FunctionDeclaration") {
    return !!node.declaration.id;
  }
  return false;
}

function computeTargetOrder(currentNodes, expectedOrder) {
  const names = currentNodes.map(memberName);
  const expectedSet = new Set(expectedOrder);
  // Mapped subset in current order — used to detect "already correct"
  // without rebuilding when nothing maps.
  const mappedIdxByName = new Map();
  names.forEach((n, i) => {
    if (n && expectedSet.has(n) && !mappedIdxByName.has(n)) mappedIdxByName.set(n, i);
  });
  if (mappedIdxByName.size === 0) return currentNodes;

  // Target: for each expected name, take ALL same-named nodes (in their
  // current relative order) and place them together at the manifest
  // position. Keeps getter/setter pairs and TS overload signatures
  // grouped — splitting them would corrupt the class.
  // Then append remaining unmapped nodes in their current order.
  const used = new Array(currentNodes.length).fill(false);
  const target = [];
  for (const name of expectedOrder) {
    for (let i = 0; i < currentNodes.length; i++) {
      if (used[i]) continue;
      if (names[i] === name) {
        target.push(currentNodes[i]);
        used[i] = true;
      }
    }
  }
  for (let i = 0; i < currentNodes.length; i++) {
    if (!used[i]) target.push(currentNodes[i]);
  }
  return target;
}

function ordersDiffer(a, b) {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
  return false;
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Class members and top-level functions should appear in Rails source order.",
    },
    fixable: "code",
    schema: [],
    messages: {
      outOfOrder:
        "Members are not in Rails source order ({{count}} mismatch(es)). Expected first mismatch: `{{name}}` should precede `{{before}}`. Run `pnpm lint --fix` to apply.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.();
    if (!filename) return {};
    const rel = relFromRepoRoot(filename);
    const manifest = loadManifest();
    const expectedOrder = manifest.files?.[rel];
    if (!expectedOrder || expectedOrder.length === 0) return {};

    const sourceCode = context.sourceCode ?? context.getSourceCode();

    // File-level opt-out: `/** @rails-structure-skip … */` anywhere in
    // the file's leading-comment block disables this rule for the file.
    // Per docs/rails-file-structure-mirror-plan.md §5.1; gives a
    // grep-able audit trail vs. generic `/* eslint-disable */`.
    for (const c of sourceCode.getAllComments()) {
      if (c.type === "Block" && /@rails-structure-skip\b/.test(c.value)) {
        return {};
      }
    }

    // Only MethodDefinition (inside ClassBody) and FunctionDeclaration
    // (top-level, possibly under ExportNamedDeclaration) are orderable.
    // This is deliberately narrow:
    //   - Class members have no hoisting/TDZ concern; reordering is safe.
    //   - FunctionDeclarations are hoisted, so reordering is safe.
    // Widening to ClassDeclaration / VariableDeclaration / `const x = …`
    // would risk TDZ violations (plan §7) — don't do it without scope
    // analysis to verify each move is safe.
    const containers = [];

    return {
      ClassBody(node) {
        const orderable = node.body.filter(isOrderableClassMember);
        if (orderable.length < 2) return;
        containers.push({ container: node, members: orderable });
      },
      "Program:exit"(programNode) {
        const topLevel = programNode.body.filter(isOrderableTopLevel);
        if (topLevel.length >= 2) {
          containers.push({ container: programNode, members: topLevel });
        }

        const fixes = [];
        let firstMismatch = null; // { node, expectedName, beforeName }
        let mismatchCount = 0;

        for (const { members } of containers) {
          const target = computeTargetOrder(members, expectedOrder);
          if (!ordersDiffer(members, target)) continue;

          // Capture block texts BEFORE any fixes are applied so the
          // single autofix pass swaps them all at once.
          const slotBlocks = members.map((m) => blockText(m, sourceCode));
          const targetBlocks = target.map((m) => blockText(m, sourceCode));

          for (let i = 0; i < members.length; i++) {
            fixes.push({
              range: [slotBlocks[i].start, slotBlocks[i].end],
              text: targetBlocks[i].text,
            });
            if (members[i] !== target[i]) {
              mismatchCount++;
              if (!firstMismatch) {
                firstMismatch = {
                  node: members[i],
                  expectedName: memberName(target[i]),
                  beforeName: memberName(members[i]),
                };
              }
            }
          }
        }

        if (fixes.length === 0) return;

        context.report({
          node: firstMismatch.node,
          messageId: "outOfOrder",
          data: {
            count: String(mismatchCount),
            name: firstMismatch.expectedName ?? "?",
            before: firstMismatch.beforeName ?? "?",
          },
          fix(fixer) {
            // Sort fixes by range start; ESLint requires non-overlapping
            // ranges. Slots are derived from distinct AST nodes so they
            // do not overlap by construction.
            fixes.sort((a, b) => a.range[0] - b.range[0]);
            return fixes.map((f) => fixer.replaceTextRange(f.range, f.text));
          },
        });
      },
    };
  },
};

export default rule;
