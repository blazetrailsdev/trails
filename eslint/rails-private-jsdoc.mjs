/**
 * ESLint rule: rails-private-jsdoc
 *
 * Requires `@internal` JSDoc on TS declarations whose Rails counterpart
 * is private/protected on every host that defines the same method name
 * in the same Ruby source file. The website's TypeDoc build runs with
 * `excludeInternal: true`, so the tag keeps Rails-private surface out
 * of the generated API reference.
 *
 * The "all-private" guard means a name shared with a public Rails host
 * (e.g. ActiveModel::Attributes#attribute is private but
 * ActiveModel::Attributes::ClassMethods#attribute is public) is left
 * alone — public on any sibling host wins.
 *
 * Manifest is generated from rails-api.json:
 *   pnpm tsx scripts/build-rails-privates-manifest.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(__dirname, "rails-private-methods.json");

let manifestCache = null;
let manifestPresent = false;

/**
 * Test seam; pass `null` to install the "manifest absent" state. The manifest is
 * gitignored and only exists after
 * `pnpm rails-privates:manifest`, so a rule test has to supply its own. Writing
 * one to the real path instead would not be hermetic: vitest runs the two rule
 * tests in separate forked processes over one filesystem, and whichever restored
 * last decided what the file held afterwards — which is how a fixture ends up
 * parked on top of the real manifest for the rest of the session.
 */
export function setManifestForTests(manifest) {
  // `null` installs the INERT state — an empty manifest, which is exactly what
  // the Lint job writes and what a rule that flags what the manifest does NOT
  // list has to be tested against.
  manifestCache = manifest ?? { files: {} };
  manifestPresent = hasEntries(manifestCache);
}

function hasEntries(manifest) {
  return Object.keys(manifest?.files ?? {}).length > 0;
}

export function loadManifest() {
  if (manifestCache) return manifestCache;
  manifestCache = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"))
    : { files: {} };
  manifestPresent = hasEntries(manifestCache);
  return manifestCache;
}

/**
 * Whether the manifest carries real data, as opposed to being INERT.
 *
 * Presence is decided by CONTENT, not by the file existing: `prelint` runs the
 * builder with `--allow-missing`, which — when rails-api.json is absent — WRITES
 * an empty manifest rather than skipping, and says in so many words that the
 * rules reading it "will report nothing" for that run. An existence check
 * therefore reads INERT as real and answers backwards for a rule whose polarity
 * is "flag what the manifest does NOT list".
 */
export function manifestAvailable() {
  loadManifest();
  return manifestPresent;
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

export function relFromRepoRoot(filename) {
  return path.relative(repoRoot(), filename).split(path.sep).join("/");
}

export function attachedJsDoc(node, sourceCode) {
  // Only treat the closest preceding JSDoc as attached to `node`. A
  // file header `/** ... */` separated from the declaration by blank
  // lines must not be matched, otherwise the autofix would edit the
  // wrong block. Require the comment to end on the line immediately
  // above the declaration with no intervening tokens.
  const comments = sourceCode.getCommentsBefore(node);
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.type !== "Block") continue;
    if (!c.value.startsWith("*")) continue;
    if (!c.loc || !node.loc) continue;
    if (c.loc.end.line !== node.loc.start.line - 1) continue;
    const tokenBefore = sourceCode.getTokenBefore(node);
    if (
      tokenBefore &&
      tokenBefore.range[0] >= c.range[1] &&
      tokenBefore.range[1] <= node.range[0]
    ) {
      continue;
    }
    return c;
  }
  return null;
}

function jsdocHasInternal(node, sourceCode) {
  const comment = attachedJsDoc(node, sourceCode);
  return { tag: comment !== null && comment.value.includes("@internal"), comment };
}

function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : "";
}

function fixerInsertInternal(fixer, node, sourceCode, jsdocComment) {
  if (jsdocComment) {
    // Single-line JSDoc (`/** Foo */`): expand into a multi-line block.
    if (jsdocComment.loc.start.line === jsdocComment.loc.end.line) {
      const lineText = sourceCode.lines[jsdocComment.loc.start.line - 1] ?? "";
      const indent = indentOf(lineText);
      const inner = jsdocComment.value
        .replace(/^\*+\s?/, "")
        .replace(/\s+$/, "")
        .trim();
      const lines = [`/**`];
      if (inner) lines.push(`${indent} * ${inner}`);
      lines.push(`${indent} *`);
      lines.push(`${indent} * @internal`);
      lines.push(`${indent} */`);
      return fixer.replaceTextRange(jsdocComment.range, lines.join("\n"));
    }
    // Multi-line JSDoc: insert ` * @internal` immediately before closing `*/`.
    const text = sourceCode.getText().slice(jsdocComment.range[0], jsdocComment.range[1]);
    const closeIdx = text.lastIndexOf("*/");
    const beforeClose = text.slice(0, closeIdx);
    const lineNum = jsdocComment.loc.end.line;
    const lineText = sourceCode.lines[lineNum - 1] ?? "";
    const indent = indentOf(lineText);
    const trimmed = beforeClose.replace(/[ \t]*$/, "");
    const trimmedEndsWithBlank = /(?:^|\n)\s*\*\s*$/.test(trimmed);
    const insertion = trimmedEndsWithBlank
      ? `* @internal\n${indent}`
      : `*\n${indent}* @internal\n${indent}`;
    return fixer.replaceTextRange(
      [jsdocComment.range[0], jsdocComment.range[1]],
      beforeClose + insertion + "*/",
    );
  }
  // Fresh JSDoc above the node.
  const startLine = node.loc.start.line;
  const lineText = sourceCode.lines[startLine - 1] ?? "";
  const indent = indentOf(lineText);
  return fixer.insertTextBeforeRange(node.range, `/** @internal */\n${indent}`);
}

/**
 * TS name of the class / interface a member is declared in, or `null` for a
 * top-level declaration. The manifest's `entities` map is keyed by exactly this
 * name (the last segment of the contributing Ruby entity's FQN).
 */
export function enclosingEntityName(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (cur.type === "ClassDeclaration" || cur.type === "ClassExpression") {
      return cur.id?.name ?? null;
    }
    if (cur.type === "TSInterfaceDeclaration") return cur.id?.name ?? null;
  }
  return null;
}

/**
 * Whether the manifest tags `name` in `rel`.
 *
 * The manifest's `entities` entry names the Rails entities that project onto
 * this TS file. A declaration whose enclosing class/interface is NOT one of
 * them is a type Rails does not have — `rack/lock.ts` hosts Rails' `Rack::Lock`
 * (whose `unlock` is private, rack/lib/rack/lock.rb) beside a local `Mutex`
 * protocol whose `unlock` mirrors the PUBLIC stdlib `Mutex#unlock` — and its
 * members are not gated by a name some other entity in the file made private.
 *
 * An INSTANCE member also reads `instanceFiles`, the same fold run over the
 * file's instance halves alone: one `.rb` can declare the same name at two
 * visibilities on the two halves of one Concern — `attribute` is public on
 * `ActiveModel::Attributes::ClassMethods` (attributes.rb:59) and private on the
 * instance half (attributes.rb:161) — and the file-wide fold publishes the
 * private one.
 *
 * A static member or a top-level declaration (the module-mixin idiom puts a
 * module's methods there as `this`-typed functions) reads the file-wide union
 * alone, since its Ruby counterpart is on the class-method half the instance
 * fold excludes.
 *
 * An instance member of a class that IS a Ruby entity reads that entity's own
 * fold too, from `entityInstanceFiles`. A nested entity's private member is
 * invisible to both file-wide folds whenever a sibling entity in the same `.rb`
 * publishes the name — `LoaderRecords#load_records` is private
 * (associations/preloader/association.rb:91) beside a public
 * `Association#load_records` (:197) — and the per-entity fold is the only place
 * its privacy survives. It is read as an additional source, never a subtractive
 * one, so nothing the file-wide union backs is lost.
 */
export function manifestTags(manifest, rel, entity, name, instanceMember) {
  const entities = manifest.entities?.[rel];
  if (entity !== null && entities && !entities.includes(entity)) return false;
  if ((manifest.files?.[rel] ?? []).includes(name)) return true;
  if (!instanceMember) return false;
  if ((manifest.instanceFiles?.[rel] ?? []).includes(name)) return true;
  return entityPrivate(manifest, rel, entity, name);
}

/**
 * Whether the Ruby entity the enclosing TS class mirrors declares `name`
 * private on its own instance half.
 */
export function entityPrivate(manifest, rel, entity, name) {
  if (entity === null) return false;
  return (manifest.entityInstanceFiles?.[rel]?.[entity] ?? []).includes(name);
}

/**
 * Whether `node` is an instance-side declaration — a non-static class member or
 * an interface member. A static member mirrors a Ruby class method, whose
 * visibility is tracked on the other half of the Concern.
 */
export function isInstanceMember(node) {
  if (node.type === "MethodDefinition" || node.type === "PropertyDefinition") {
    return node.static !== true;
  }
  return node.type === "TSMethodSignature" || node.type === "TSPropertySignature";
}

function check(context, node, name) {
  if (!name) return;
  // For autofix + comment lookup, use the outer ExportNamedDeclaration
  // when present so we insert *before* `export` rather than between
  // `export` and `function`.
  const target = node.parent && node.parent.type === "ExportNamedDeclaration" ? node.parent : node;
  const filename = context.filename ?? context.getFilename?.();
  if (!filename) return;
  const rel = relFromRepoRoot(filename);
  const manifest = loadManifest();
  if (!manifestTags(manifest, rel, enclosingEntityName(node), name, isInstanceMember(node))) return;

  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const { tag, comment } = jsdocHasInternal(target, sourceCode);
  if (tag) return;

  context.report({
    node: target,
    messageId: "missingInternal",
    data: { name },
    fix(fixer) {
      return fixerInsertInternal(fixer, target, sourceCode, comment);
    },
  });
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `@internal` JSDoc on TS declarations whose Rails counterpart is private/protected.",
    },
    fixable: "code",
    schema: [],
    messages: {
      missingInternal:
        "`{{name}}` is private/protected in Rails. Add a `@internal` JSDoc tag so it stays out of the website API reference.",
    },
  },
  create(context) {
    return {
      // export function foo() {} — top-level only
      "Program > ExportNamedDeclaration > FunctionDeclaration"(node) {
        check(context, node, node.id?.name);
      },
      "Program > FunctionDeclaration"(node) {
        check(context, node, node.id?.name);
      },
      // class members: methods, getters/setters, property assignments.
      "ClassBody > MethodDefinition"(node) {
        if (node.key?.type !== "Identifier") return;
        if (node.accessibility === "private" || node.accessibility === "protected") return;
        check(context, node, node.key.name);
      },
      "ClassBody > PropertyDefinition"(node) {
        if (node.key?.type !== "Identifier") return;
        if (node.accessibility === "private" || node.accessibility === "protected") return;
        check(context, node, node.key.name);
      },
      // Interface methods. TypeDoc documents these independently from
      // the concrete class implementation, so polymorphic-dispatch
      // contracts (e.g. TemplateResolver.findLayout?) need their own
      // `@internal` tag.
      //
      // Deliberately NOT matching TSPropertySignature: most interface
      // properties whose name collides with a Rails-private accessor
      // are user-facing config options (e.g. `delimiter` on
      // NumberHelperOptions, `logger` on DebugExceptionsOptions),
      // not internal accessors. Tagging them via autofix would hide
      // real public surface. Use a manual `/** @internal */` if the
      // collision is genuine.
      "TSInterfaceBody > TSMethodSignature"(node) {
        if (node.key?.type !== "Identifier") return;
        check(context, node, node.key.name);
      },
    };
  },
};

export default rule;
