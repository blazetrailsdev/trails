/**
 * ESLint rule: rails-method-order
 *
 * Enforces that class members and top-level functions appear in the same
 * source order as their Rails counterparts. The manifest is generated
 * from rails-api.json:
 *   pnpm tsx scripts/build-rails-method-order-manifest.ts
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
const MANIFEST_PATH = path.resolve(__dirname, "rails-method-order.json");

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
  // Walk leading comments backwards, including each that ends on the
  // line immediately above the previous start (no intervening tokens or
  // blank lines). This mirrors rails-private-jsdoc's attachment rule.
  const comments = sourceCode.getCommentsBefore(node);
  let attachedStart = node.range[0];
  let prevLine = node.loc.start.line;
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (!c.loc) break;
    if (c.loc.end.line !== prevLine - 1) break;
    const tokenBetween = sourceCode.getTokenAfter(c, { includeComments: false });
    if (tokenBetween && tokenBetween.range[0] < node.range[0] && tokenBetween.range[0] >= c.range[1]) {
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

  // Target: expectedOrder ∩ present, in expectedOrder; then unmapped in
  // current order. Duplicate names (rare; e.g. overload getters) keep
  // their current relative order via the index map.
  const used = new Array(currentNodes.length).fill(false);
  const target = [];
  for (const name of expectedOrder) {
    for (let i = 0; i < currentNodes.length; i++) {
      if (used[i]) continue;
      if (names[i] === name) {
        target.push(currentNodes[i]);
        used[i] = true;
        break;
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
        "Members are not in Rails source order. Expected sequence (mapped names): {{expected}}; got: {{actual}}.",
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
        let firstOutOfOrder = null;
        const reports = [];

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
          }

          const mappedActual = members.map(memberName).filter((n) => n && expectedOrder.includes(n));
          const mappedExpected = target.map(memberName).filter((n) => n && expectedOrder.includes(n));
          if (!firstOutOfOrder) firstOutOfOrder = members[0];
          reports.push({ actual: mappedActual, expected: mappedExpected });
        }

        if (fixes.length === 0) return;

        const combined = reports[0];
        context.report({
          node: firstOutOfOrder ?? programNode,
          messageId: "outOfOrder",
          data: {
            expected: combined.expected.join(", "),
            actual: combined.actual.join(", "),
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
