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
 * The manifest keys expected order per container: `classes[Name]` for
 * each class body (matched by the class's declared name) and `functions`
 * for the file's top-level functions. For each container, the rule
 * filters expected names to those present in that container; the relative
 * order between mapped names must match. Names not in the manifest
 * (TS-only helpers) preserve their relative order after the mapped block.
 * Keying per class lets one file define several classes whose members
 * share names but appear in different Rails order (e.g. `casted.rb`'s
 * `Casted` vs `Quoted`). A class body is matched to a bucket by exact TS
 * name; when trails renamed the Rails constant (`Type::Integer` →
 * `IntegerType`, `Name` → `ModelName`), it falls back to pairing the sole
 * unmatched class body with the sole unmatched bucket. Anything more
 * ambiguous is left unordered.
 *
 * A manifest entry is `name` for a Ruby instance method and `static name`
 * for a Ruby class method. Staticness discriminates only when it has to:
 * a slot prefers a member of matching staticness, and falls back to a
 * mismatched one when the container declares nothing with the expected
 * staticness (the common port that flipped instance↔static). A same-named
 * member of the OTHER staticness, when Rails defines only one of the two,
 * is a trails invention and stays in the unmapped tail.
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

/**
 * True when the manifest on disk carries real order data.
 *
 * The manifest is generated from `scripts/api-compare/output/rails-api.json`,
 * which only exists after `pnpm api:compare` (Ruby + vendored Rails). Runs
 * without it pass `--allow-missing` to the builder (see
 * scripts/api-compare/require-rails-api.ts) and get an empty manifest, under
 * which this rule would pass every file. `eslint.config.mjs` uses this to
 * leave the rule unregistered for those runs rather than registering it
 * inert — see docs/infrastructure/rails-file-structure-mirror-plan.md.
 */
export function isManifestAvailable(manifestPath = MANIFEST_PATH) {
  // The real manifest is megabytes; go through the cache for the default path
  // so config-time gating and rule-time lookups parse it once.
  const manifest = manifestPath === MANIFEST_PATH ? loadManifest() : readManifest(manifestPath);
  return Object.keys(manifest.files ?? {}).length > 0;
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return { files: {} };
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

let manifestCache = null;
function loadManifest() {
  if (!manifestCache) manifestCache = readManifest(MANIFEST_PATH);
  return manifestCache;
}

// Opt-in coverage report (set RAILS_STRUCTURE_REPORT=1, as the CI step does).
// Manifest buckets that match no container in their file are silently dropped —
// a Rails constant trails renamed past the substring fallback, or a Ruby module
// ported as a TS class (its order lands in `functions`, which no class body
// reads). This surfaces them so the drop is visible rather than invisible.
const coverageReport = process.env.RAILS_STRUCTURE_REPORT ? [] : null;
let reportHookInstalled = false;
function installReportHook() {
  if (reportHookInstalled || !coverageReport) return;
  reportHookInstalled = true;
  process.on("exit", () => {
    if (coverageReport.length === 0) return;
    let dropped = 0;
    const lines = [];
    for (const { rel, classes, functionsDropped } of coverageReport) {
      const parts = [];
      if (classes.length) parts.push(`classes: ${classes.join(", ")}`);
      if (functionsDropped) parts.push("functions (no top-level fns)");
      if (parts.length === 0) continue;
      dropped += classes.length + (functionsDropped ? 1 : 0);
      lines.push(`  ${rel} — ${parts.join("; ")}`);
    }
    if (lines.length === 0) return;
    process.stderr.write(
      `[rails-file-structure-method-order] ${dropped} manifest bucket(s) matched no ` +
        `container (order not enforced):\n${lines.join("\n")}\n`,
    );
  });
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

function memberName(node) {
  // MethodDefinition / PropertyDefinition.
  if (node.type === "MethodDefinition" || node.type === "PropertyDefinition") {
    if (node.key?.type !== "Identifier") return null;
    if (node.key.name === "constructor") return "constructor";
    return node.key.name;
  }
  // FunctionDeclaration / TSDeclareFunction (overload signatures —
  // signature-only declarations without a body), incl. as child of
  // ExportNamedDeclaration.
  if (node.type === "FunctionDeclaration" || node.type === "TSDeclareFunction") {
    return node.id?.name ?? null;
  }
  if (
    node.type === "ExportNamedDeclaration" &&
    (node.declaration?.type === "FunctionDeclaration" ||
      node.declaration?.type === "TSDeclareFunction")
  ) {
    return node.declaration.id?.name ?? null;
  }
  return null;
}

// Name of the class a ClassBody belongs to, for manifest lookup. Handles
// `class Foo {}` / `export class Foo` / `export default class Foo`
// (ClassDeclaration.id) and `const Foo = class {}` (ClassExpression under a
// VariableDeclarator). Anonymous class expressions with no binding name
// return null and are skipped — the manifest can't address them.
function classNameOf(classBody) {
  const parent = classBody.parent;
  if (!parent) return null;
  if (
    (parent.type === "ClassDeclaration" || parent.type === "ClassExpression") &&
    parent.id?.type === "Identifier"
  ) {
    return parent.id.name;
  }
  if (parent.type === "ClassExpression" && parent.parent?.type === "VariableDeclarator") {
    const id = parent.parent.id;
    if (id?.type === "Identifier") return id.name;
  }
  return null;
}

function isOrderableClassMember(node) {
  if (node.type !== "MethodDefinition") return false;
  if (node.key?.type !== "Identifier") return false;
  return true;
}

function isOrderableTopLevel(node) {
  // TSDeclareFunction = overload signature (no body). Including them
  // is essential so a same-named impl+signature group stays adjacent
  // under reorder — TS errors out ("Function implementation name must
  // be 'foo'") if signatures get separated from their implementation.
  // The same-name grouping in computeTargetOrder keeps them together.
  if (node.type === "FunctionDeclaration" || node.type === "TSDeclareFunction") {
    return !!node.id;
  }
  if (
    node.type === "ExportNamedDeclaration" &&
    (node.declaration?.type === "FunctionDeclaration" ||
      node.declaration?.type === "TSDeclareFunction")
  ) {
    return !!node.declaration.id;
  }
  return false;
}

/**
 * Group consecutive same-named members into a single "unit". TS
 * function overload signatures (TSDeclareFunction) plus their
 * implementation must remain physically adjacent — `function foo(x):
 * A; function foo(x): B { … }` would otherwise be split by reorder if
 * a non-orderable node (type alias, interface) sits in the original
 * "slot" between the signatures and the impl. Same intent for class
 * member overloads.
 *
 * Each unit gets one slot spanning all its consecutive members. The
 * reorder algorithm then operates on units, not individual members.
 */
function groupUnits(members) {
  const units = [];
  for (const m of members) {
    const name = memberName(m);
    const isStatic = m.static === true;
    const prev = units[units.length - 1];
    // Staticness is part of the grouping key: an adjacent `static foo` /
    // `foo` pair are two distinct members that map to two distinct Rails
    // definitions, so they must not collapse into one movable unit.
    if (prev && prev.name === name && prev.isStatic === isStatic && name !== null) {
      prev.members.push(m);
    } else {
      units.push({ name, isStatic, members: [m] });
    }
  }
  return units;
}

// Manifest entries are `name` (instance) or `static name` (Rails class method).
function parseExpected(entry) {
  return entry.startsWith("static ")
    ? { name: entry.slice(7), isStatic: true }
    : { name: entry, isStatic: false };
}

// `declaredKeys` holds `static name` / `name` for EVERY member the container
// declares, including ones that are not themselves orderable. `Arel::Table`'s
// `static engine` is a PropertyDefinition (a field, not a method), so it never
// becomes a unit — but it is still the member that owns the Rails
// `static engine` slot, and its presence is what disqualifies the invented
// instance `get engine()` from being moved into that slot.
function computeTargetOrder(currentNodes, expectedOrder, declaredKeys) {
  const expected = expectedOrder.map(parseExpected);
  const names = currentNodes.map((u) => u.name);
  const expectedNames = new Set(expected.map((e) => e.name));
  // Does anything map at all? Used to detect "nothing to do" without
  // rebuilding. Staticness only ever narrows which unit fills a slot, so
  // a name-level check is the right coarse gate here.
  if (!names.some((n) => n && expectedNames.has(n))) return currentNodes;

  const used = new Array(currentNodes.length).fill(false);
  const target = [];

  // Constructor carve-out: some Rails classes inherit from Struct and have
  // no explicit `initialize`, so the manifest omits `constructor` and it
  // would land in the unmapped tail (visually unusual) — hoist it in that
  // case only. When the manifest DOES list `constructor`, Rails has a real
  // `initialize` with a real source position, and honoring that position is
  // the whole point of the manifest: `ActiveModel::Error` defines
  // `def self.full_message` (error.rb:15) and `def self.generate_message`
  // (:64) BEFORE `initialize` (:103). An unconditional hoist made those
  // files lint clean while ordered wrongly.
  if (!expectedNames.has("constructor")) {
    for (let i = 0; i < currentNodes.length; i++) {
      if (!used[i] && names[i] === "constructor") {
        target.push(currentNodes[i]);
        used[i] = true;
      }
    }
  }

  // Fill each expected slot. Prefer units whose staticness matches the Rails
  // definition. Fall back to a staticness-mismatched unit only when the
  // container declares NO member with the expected staticness — that is the
  // common, benign case of a port that legitimately flipped instance↔static,
  // and matching it keeps those files ordered exactly as before.
  //
  // When the expected member IS declared, a differently-scoped same-named
  // member is a trails invention with no Rails counterpart, so it stays in the
  // unmapped tail rather than being moved into a slot that belongs to its
  // sibling. `Arel::Table` is the case: Rails has only the class-level
  // `attr_accessor :engine` (table.rb:9); trails' extra instance
  // `get engine()` is an invention and gets no Rails-derived position.
  for (const { name, isStatic } of expected) {
    const exactDeclared = declaredKeys.has(isStatic ? `static ${name}` : name);
    for (let i = 0; i < currentNodes.length; i++) {
      if (used[i] || names[i] !== name) continue;
      if (exactDeclared && currentNodes[i].isStatic !== isStatic) continue;
      target.push(currentNodes[i]);
      used[i] = true;
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
    const fileOrder = manifest.files?.[rel];
    if (!fileOrder) return {};
    const classOrders = fileOrder.classes ?? {};
    const functionOrder = fileOrder.functions ?? [];
    const hasAnyOrder =
      functionOrder.length > 0 || Object.values(classOrders).some((a) => a.length > 0);
    if (!hasAnyOrder) return {};

    const sourceCode = context.sourceCode ?? context.getSourceCode();

    // File-level opt-out: `/** @rails-structure-skip … */` in the
    // file's leading-comment block (before any non-comment token)
    // disables the rule for the file. Per
    // docs/rails-file-structure-mirror-plan.md §5.1. Restricting to
    // leading comments prevents a method-level JSDoc from accidentally
    // suppressing the whole file.
    const firstToken = sourceCode.getFirstToken(sourceCode.ast);
    const firstTokenStart = firstToken ? firstToken.range[0] : Infinity;
    for (const c of sourceCode.getAllComments()) {
      if (c.range[0] >= firstTokenStart) break;
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
    // Eligible class bodies collected during traversal, resolved to their
    // manifest bucket at Program:exit (see `resolveClassOrder`).
    const classCandidates = [];
    // Every class name in the file, including bodies with <2 orderable members;
    // used only to keep the coverage report signal (renames / module-as-class)
    // free of noise from small classes that were never orderable anyway.
    const allClassNames = new Set();

    return {
      ClassBody(node) {
        // Eligible iff no function-like scope sits between the class
        // and the Program root. Rejects classes nested inside a
        // function body (whose members would otherwise emit fixes
        // overlapping with a reordered enclosing FunctionDeclaration);
        // accepts top-level ClassDeclaration, default/named export,
        // and `const Foo = class { … }` / variable-declarator forms.
        let ancestor = node.parent?.parent;
        let nested = false;
        while (ancestor && ancestor.type !== "Program") {
          // TSDeclareFunction (signature-only `function foo(...): T;`)
          // intentionally omitted — it has no body, so it cannot
          // contain a ClassBody and would never appear in this chain.
          if (
            ancestor.type === "FunctionDeclaration" ||
            ancestor.type === "FunctionExpression" ||
            ancestor.type === "ArrowFunctionExpression" ||
            ancestor.type === "MethodDefinition"
          ) {
            nested = true;
            break;
          }
          ancestor = ancestor.parent;
        }
        if (nested) return;
        const name = classNameOf(node);
        if (name) allClassNames.add(name);
        const orderable = node.body.filter(isOrderableClassMember);
        if (orderable.length < 2) return;
        // Every declared member, orderable or not — see computeTargetOrder.
        const declaredKeys = new Set();
        for (const m of node.body) {
          const n = memberName(m);
          if (n) declaredKeys.add(m.static === true ? `static ${n}` : n);
        }
        classCandidates.push({ node, name, members: orderable, declaredKeys });
      },
      "Program:exit"(programNode) {
        // Assign each class body its manifest bucket. Exact TS-name match
        // first; then, because trails often RENAMES the Rails constant
        // (`ActiveModel::Type::Integer` → `IntegerType`, `ActiveModel::Name`
        // → `ModelName`, `Arel::Visitors::Dot::Node` → `DotNode`), fall back
        // to pairing when EXACTLY ONE class body and EXACTLY ONE manifest
        // bucket remain unmatched — an unambiguous 1:1 rename. Anything more
        // ambiguous is left unordered rather than risk a wrong pairing.
        const bucketKeys = Object.keys(classOrders).filter((k) => classOrders[k].length > 0);
        const usedBucket = new Set();
        for (const cand of classCandidates) {
          if (cand.name && bucketKeys.includes(cand.name) && classOrders[cand.name].length > 0) {
            cand.expectedOrder = classOrders[cand.name];
            usedBucket.add(cand.name);
          }
        }
        const unresolved = classCandidates.filter((c) => !c.expectedOrder);
        const freeBuckets = bucketKeys.filter((k) => !usedBucket.has(k));
        if (unresolved.length === 1 && freeBuckets.length === 1) {
          // Require evidence the two are the same entity before pairing: the
          // Rails constant must be a case-insensitive substring of the TS class
          // name (or vice versa). Every real rename satisfies this — `Name` ⊂
          // `ModelName`, `Integer` ⊂ `IntegerType`, `Node` ⊂ `DotNode`. Without
          // it, a file with one matched class, one TS-only helper class, and one
          // never-ported Ruby class hits the same 1/1 shape and the helper would
          // be reordered to an unrelated Rails order.
          const tsName = (unresolved[0].name ?? "").toLowerCase();
          const bucket = freeBuckets[0].toLowerCase();
          if (tsName && (tsName.includes(bucket) || bucket.includes(tsName))) {
            unresolved[0].expectedOrder = classOrders[freeBuckets[0]];
            usedBucket.add(freeBuckets[0]);
          }
        }
        for (const cand of classCandidates) {
          if (cand.expectedOrder) {
            containers.push({
              members: cand.members,
              expectedOrder: cand.expectedOrder,
              declaredKeys: cand.declaredKeys,
            });
          }
        }

        const topLevel = programNode.body.filter(isOrderableTopLevel);
        const functionsConsumed = topLevel.length >= 2 && functionOrder.length > 0;
        if (functionsConsumed) {
          containers.push({
            container: programNode,
            members: topLevel,
            expectedOrder: functionOrder,
            // Top-level functions have no staticness; every name is "instance".
            declaredKeys: new Set(topLevel.map(memberName).filter(Boolean)),
          });
        }

        if (coverageReport) {
          installReportHook();
          // Only buckets with no class of that name at all — the genuine
          // rename/module-as-class drops. A bucket whose class exists but has
          // <2 orderable members is not a concerning drop, so drop it from the
          // report signal.
          const unmatchedClasses = bucketKeys.filter(
            (k) => !usedBucket.has(k) && !allClassNames.has(k),
          );
          const functionsDropped = functionOrder.length > 0 && !functionsConsumed;
          if (unmatchedClasses.length > 0 || functionsDropped) {
            coverageReport.push({ rel, classes: unmatchedClasses, functionsDropped });
          }
        }

        const fixes = [];
        let firstMismatch = null; // { node, expectedName, beforeName }
        let mismatchCount = 0;

        for (const { members, expectedOrder, declaredKeys } of containers) {
          // Collapse consecutive same-named members into units before
          // reorder, so TS overload groups (and class accessor pairs
          // where the pair is already adjacent) move as a single block.
          const units = groupUnits(members);
          const target = computeTargetOrder(units, expectedOrder, declaredKeys);
          if (!ordersDiffer(units, target)) continue;

          // Each unit's slot spans from the first member's extended
          // start to the last member's end. Captured BEFORE any fixes
          // are applied so the single autofix pass swaps them at once.
          const slotBlocks = units.map((u) => {
            const start = extendedStart(u.members[0], sourceCode);
            const end = u.members[u.members.length - 1].range[1];
            return { start, end, text: sourceCode.getText().slice(start, end) };
          });
          const targetBlocks = target.map((u) => {
            const start = extendedStart(u.members[0], sourceCode);
            const end = u.members[u.members.length - 1].range[1];
            return { start, end, text: sourceCode.getText().slice(start, end) };
          });

          for (let i = 0; i < units.length; i++) {
            fixes.push({
              range: [slotBlocks[i].start, slotBlocks[i].end],
              text: targetBlocks[i].text,
            });
            if (units[i] !== target[i]) {
              mismatchCount++;
              if (!firstMismatch) {
                firstMismatch = {
                  node: units[i].members[0],
                  expectedName: target[i].name,
                  beforeName: units[i].name,
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
