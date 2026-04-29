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
function loadManifest() {
  if (manifestCache) return manifestCache;
  if (!fs.existsSync(MANIFEST_PATH)) {
    manifestCache = { files: {}, packageGlobals: {} };
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

function packageOf(rel) {
  // packages/<pkg>/... → package id used in manifest.packageGlobals.
  // actionpack hosts both actioncontroller and actiondispatch as
  // sub-namespaces; actionview is its own top-level package.
  // packages/rack is a separate Rack implementation (not Rails'
  // actiondispatch) and has no rails-api counterpart, so it's left
  // out of package-global matching.
  const m = rel.match(/^packages\/([^/]+)\/src(?:\/([^/]+))?\//);
  if (!m) return null;
  if (m[1] === "actionpack") {
    return m[2] === "actiondispatch" ? "actiondispatch" : "actioncontroller";
  }
  return m[1];
}

function jsdocHasInternal(node, sourceCode) {
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
    return { tag: c.value.includes("@internal"), comment: c };
  }
  return { tag: false, comment: null };
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
  const fileNames = manifest.files?.[rel];
  const pkg = packageOf(rel);
  const globalNames = pkg ? manifest.packageGlobals?.[pkg] : null;
  const matched =
    (fileNames && fileNames.includes(name)) || (globalNames && globalNames.includes(name));
  if (!matched) return;

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
      // Interface members. TypeDoc documents these independently from
      // the concrete class implementation, so they need their own
      // `@internal` tag. Deliberately not matching TSTypeLiteral —
      // those appear in parameter type positions (e.g.
      // `fn(opts: { actionPath?: string })`) where the property
      // signatures aren't documented surface, and tagging them would
      // splice JSDoc into the middle of a function signature.
      "TSInterfaceBody > TSMethodSignature"(node) {
        if (node.key?.type !== "Identifier") return;
        check(context, node, node.key.name);
      },
      "TSInterfaceBody > TSPropertySignature"(node) {
        if (node.key?.type !== "Identifier") return;
        check(context, node, node.key.name);
      },
    };
  },
};

export default rule;
