// Pure text-transform that turns a user-authored model source into a
// virtualized version with `declare` members spliced into each affected
// class body. No on-disk output; no `ts.Program` or `TypeChecker`
// dependency.
//
// Shells (the trails-tsc CLI and the tsserver plugin) call this and hand
// the result back to the compiler / language service. Tests exercise it
// directly against fixture pairs.

import ts from "typescript";
import { walk, findIncludeCalls, type WalkOptions } from "./walker.js";
import { synthesizeDeclares } from "./synthesize.js";

// Aliased name used in the auto-injected `import type` line and the
// generated interface-merge heritage. Aliasing (rather than importing
// `Included` bare) avoids `Cannot redeclare block-scoped variable`
// when the user file already imports `Included` themselves.
const INCLUDED_ALIAS = "__TrailsIncluded";
const INCLUDED_IMPORT_LINE = `import type { Included as ${INCLUDED_ALIAS} } from "@blazetrails/activesupport";`;

export interface LineDelta {
  /**
   * 0-indexed line in the VIRTUALIZED text where the injected block
   * begins. The injected range spans
   * `insertedAtLine + 1 .. insertedAtLine + lineCount`, and those
   * virtual lines have no corresponding line in the original source.
   *
   * To map a later virtual line back to the original source,
   * `remapLine` subtracts `lineCount` once the line is after the
   * injected block; deltas are stacked in ascending virtual order so
   * multi-class files and prepended imports compose correctly.
   *
   * The sentinel value `-1` means the block was prepended ABOVE
   * virtual line 0 (used by `prependImports` for auto-imports).
   */
  insertedAtLine: number;
  /** Number of lines the injected block spans. */
  lineCount: number;
}

export interface VirtualizeResult {
  text: string;
  deltas: LineDelta[];
}

export interface VirtualizeOptions extends WalkOptions {
  prependImports?: readonly string[];
  /**
   * Schema columns keyed by table name. When supplied, the virtualizer
   * emits `declare <col>: <tsType>` for every column not already covered
   * by a user-authored `declare` or `this.attribute(...)` call — giving
   * IDE autocomplete to schema-only columns (Rails-default pattern:
   * columns come from the migration, not from per-class declarations).
   *
   * Table resolution: `static tableName = "..."` on the class when
   * present, otherwise `pluralize(underscore(className))`.
   *
   * Each column's value is a `SchemaColumnValue` — either:
   *   - a Rails type string (legacy shape, e.g. `"string"`), or
   *   - a rich object `{ type, null?, arrayElementType? }` as emitted
   *     by `dumpSchemaColumns`. `null: false` renders `Type`;
   *     `null: true` OR `null` omitted renders `Type | null` (Rails'
   *     conservative default — columns without a NOT NULL constraint
   *     are nullable). `arrayElementType` on an `array` column renders
   *     `ElementTsType[]` instead of the default `unknown[]`.
   *
   * Caveats:
   * - `id` is skipped (Base's `PrimaryKeyValue` accessor handles it).
   * - Non-identifier / reserved-word names are emitted as quoted class
   *   fields (`declare "strange-col": string;`).
   * - Columns are emitted in sorted order for stable output.
   */
  schemaColumnsByTable?: Readonly<
    Record<string, Readonly<Record<string, import("./synthesize.js").SchemaColumnValue>>>
  >;
}

export function virtualize(
  originalText: string,
  fileName: string,
  options: VirtualizeOptions = {},
): VirtualizeResult {
  const sf = ts.createSourceFile(fileName, originalText, ts.ScriptTarget.ES2022, true);
  const classes = walk(sf, options);

  interface Edit {
    pos: number;
    text: string;
    originalLine: number;
    lineCount: number;
  }
  const edits: Edit[] = [];

  for (const info of classes) {
    if (info.skip) continue;
    if (info.openBracePos < 0) continue;
    const decls = synthesizeDeclares(info, {
      schemaColumnsByTable: options.schemaColumnsByTable,
    });
    if (decls.length === 0) continue;
    const block = "\n" + decls.join("\n") + "\n";
    edits.push({
      pos: info.openBracePos,
      text: block,
      originalLine: sf.getLineAndCharacterOfPosition(info.openBracePos).line,
      lineCount: decls.length + 1, // leading newline + one per decl
    });
  }

  edits.sort((a, b) => b.pos - a.pos);

  let text = originalText;
  for (const e of edits) {
    text = text.slice(0, e.pos) + e.text + text.slice(e.pos);
  }

  // Convert each edit's originalLine into a VIRTUAL line by accumulating
  // the lineCount of all earlier injections. `remapLine` expects
  // `insertedAtLine` to be a virtual coordinate so multi-class files
  // (two injected declare blocks) remap correctly for lines after the
  // second block.
  // Sort by (originalLine, pos) so multiple injections on the same
  // line (e.g., two one-line class declarations) compose in stable,
  // file-order delta-cumulation for remapLine.
  const sortedEdits = edits
    .slice()
    .sort((a, b) => a.originalLine - b.originalLine || a.pos - b.pos);
  let cumulative = 0;
  const deltas: LineDelta[] = sortedEdits.map((e) => {
    const d: LineDelta = { insertedAtLine: e.originalLine + cumulative, lineCount: e.lineCount };
    cumulative += e.lineCount;
    return d;
  });

  // Detect `include(...)` calls and fold both the aliased
  // `import type` line AND the generated interface-merge declarations
  // into the same prepend pass. Appending at end-of-file would leave
  // diagnostics on those lines un-remappable (no delta entry), which
  // causes `getPositionOfLineAndCharacter` to crash. Putting them in
  // the prepend block reuses the existing delta math.
  // Declaration merging is order-agnostic — TS resolves
  // `interface Foo extends ...` before the class declaration just
  // fine.
  const includes = findIncludeCalls(sf);
  const effectivePrepends: string[] = [];
  if (options.prependImports) effectivePrepends.push(...options.prependImports);
  if (includes.length > 0) {
    // Three cases for the `__TrailsIncluded` binding:
    //   - "absent": inject the import AND interfaces.
    //   - "matches": existing binding is `Included as __TrailsIncluded`
    //     from `@blazetrails/activesupport` (e.g. re-virtualizing prior
    //     output, or a user-written equivalent). Skip the import line
    //     but still emit interfaces, reusing the existing alias.
    //   - "different": some other binding owns the name. Skip the
    //     entire bridge — emitting interfaces would type them against
    //     the wrong symbol.
    const aliasState = checkIncludedAliasBinding(sf, INCLUDED_ALIAS);
    if (aliasState !== "different") {
      if (aliasState === "absent") effectivePrepends.push(INCLUDED_IMPORT_LINE);
      // Skip auto-bridging classes whose name already has a top-level
      // `interface` declaration in the file — the user is hand-typing
      // refined signatures (e.g. overloads narrower than the module's
      // erased ones), and adding an `Included<typeof Mod>` heritage
      // could widen those back to `(...args: unknown[]) => any`.
      const userInterfaces = collectInterfaceNames(sf);
      interface Group {
        mods: string[];
        exported: boolean;
        typeParams: string;
      }
      const grouped = new Map<string, Group>();
      for (const inc of includes) {
        if (userInterfaces.has(inc.className)) continue;
        const entry = grouped.get(inc.className);
        if (entry) entry.mods.push(inc.moduleExpr);
        else
          grouped.set(inc.className, {
            mods: [inc.moduleExpr],
            exported: inc.classExported,
            typeParams: inc.classTypeParams,
          });
      }
      for (const [className, { mods, exported, typeParams }] of grouped) {
        const heritage = mods.map((m) => `${INCLUDED_ALIAS}<typeof ${m}>`).join(", ");
        // Match the class's export modifier and generic parameters —
        // declaration merging requires both to line up.
        const prefix = exported ? "export " : "";
        effectivePrepends.push(
          `${prefix}interface ${className}${typeParams} extends ${heritage} {}`,
        );
      }
    }
  }

  // Insert the prepend block AFTER any leading directives (shebangs,
  // triple-slash refs, @ts-nocheck) that must stay at the top of the
  // file. The block is one line per entry — entries may be `import type`
  // lines (auto-imports + the `Included` alias) AND/OR synthesized
  // `interface X extends ...` declarations from include() bridging.
  // All entries are erased at runtime (types only).
  const prependLines = effectivePrepends.length > 0 ? effectivePrepends : undefined;
  if (prependLines && prependLines.length > 0) {
    const importBlock = prependLines.join("\n") + "\n";
    const insertPos = findDirectiveEnd(text);
    // Compute the virtual line BEFORE which the import block is
    // inserted: `-1` if the block is truly at the start of the file,
    // otherwise the line index of the last directive/blank line that
    // precedes the insertion point. This preserves `remapLine` for
    // any leading directives (shebang / @ts-nocheck / triple-slash)
    // — including the edge case where the file ends at a directive
    // with no trailing newline (in which case `split(/\r?\n/)`
    // wouldn't produce a final empty element, so subtracting 2 would
    // be off by one).
    const before = text.slice(0, insertPos);
    const newlineCount = (before.match(/\r?\n/g) ?? []).length;
    const insertedAtLine =
      insertPos === 0 ? -1 : before.endsWith("\n") ? newlineCount - 1 : newlineCount;
    text = text.slice(0, insertPos) + importBlock + text.slice(insertPos);
    // Count physical newlines in the inserted block rather than
    // trusting `prependLines.length`. Synthesized entries derived from
    // `getText()` (module expressions, type parameter lists) may carry
    // embedded newlines when the original source formats them across
    // lines — undercounting here breaks delta remapping for every
    // line below the prepend block.
    const prependedLines = (importBlock.match(/\r?\n/g) ?? []).length;
    for (const d of deltas) {
      d.insertedAtLine += prependedLines;
    }
    deltas.unshift({ insertedAtLine, lineCount: prependedLines });
  }

  return { text, deltas };
}

type AliasBindingState = "absent" | "matches" | "different";

/**
 * Classify any existing top-level binding for `alias` in `sf`:
 *   - "absent": no top-level statement binds the name.
 *   - "matches": a single `import` from `@blazetrails/activesupport`
 *     binds it as `Included as <alias>` — we can reuse the binding.
 *   - "different": something else owns the name (different module,
 *     namespace import, type alias, var, etc.). Reusing would type
 *     against the wrong symbol; the caller should bail entirely.
 */
function checkIncludedAliasBinding(sf: ts.SourceFile, alias: string): AliasBindingState {
  let state: AliasBindingState = "absent";
  const escalate = (next: AliasBindingState): void => {
    if (next === "different") state = "different";
    else if (next === "matches" && state !== "different") state = "matches";
  };
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      if (!clause) continue;
      if (clause.name?.text === alias) {
        escalate("different");
        continue;
      }
      const named = clause.namedBindings;
      if (!named) continue;
      if (ts.isNamespaceImport(named) && named.name.text === alias) {
        escalate("different");
        continue;
      }
      if (!ts.isNamedImports(named)) continue;
      for (const el of named.elements) {
        if (el.name.text !== alias) continue;
        const importedName = el.propertyName?.text ?? el.name.text;
        const fromActivesupport =
          ts.isStringLiteralLike(stmt.moduleSpecifier) &&
          stmt.moduleSpecifier.text === "@blazetrails/activesupport";
        if (fromActivesupport && importedName === "Included") escalate("matches");
        else escalate("different");
      }
      continue;
    }
    if (
      (ts.isTypeAliasDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isFunctionDeclaration(stmt)) &&
      stmt.name?.text === alias
    ) {
      escalate("different");
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === alias) escalate("different");
      }
    }
  }
  return state;
}

function collectInterfaceNames(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt) && stmt.name) out.add(stmt.name.text);
  }
  return out;
}

/**
 * Find the character offset AFTER any leading directives that must
 * stay at the top of the file: shebangs (`#!`), triple-slash refs
 * (`/// <reference ...>`), and TS comment directives (`// @ts-nocheck`
 * etc.). Auto-imports are inserted at this offset so they don't break
 * file-leading semantics.
 */
function findDirectiveEnd(text: string): number {
  // Scan line-by-line preserving the actual line terminator width
  // (`\n` or `\r\n`) so the returned offset is a valid index in
  // `text`. Stops at the first non-directive, non-blank line; also
  // stops if the file ends without a trailing newline so we never
  // overshoot `text.length`.
  const lineRe = /([^\r\n]*)(\r?\n|$)/g;
  let pos = 0;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(text)) !== null) {
    const [full, line, terminator] = match;
    if (terminator === "" && line === "") break;
    const trimmed = line!.trimStart();
    // File-leading directives we preserve above the auto-import block:
    //   - shebangs (`#!...`)
    //   - triple-slash reference directives (`/// <reference ...>`)
    //   - whole-file TS pragmas `// @ts-nocheck` / `// @ts-check`
    //     (NOT `// @ts-ignore` / `// @ts-expect-error`, which apply to
    //     the NEXT statement — injecting imports between the pragma
    //     and the statement would change behavior)
    //   - single-line block-comment form `/* @ts-nocheck */` /
    //     `/* @ts-check */` (multi-line `/* ... */` would require
    //     scanning to `*/` to avoid splicing into the comment body)
    //   - blank lines in between
    const isSingleLineBlockPragma =
      (trimmed.startsWith("/* @ts-nocheck") || trimmed.startsWith("/* @ts-check")) &&
      trimmed.includes("*/");
    if (
      trimmed.startsWith("#!") ||
      trimmed.startsWith("/// <") ||
      trimmed.startsWith("// @ts-nocheck") ||
      trimmed.startsWith("// @ts-check") ||
      isSingleLineBlockPragma ||
      trimmed === ""
    ) {
      pos += full!.length;
      if (terminator === "") break;
    } else {
      break;
    }
  }
  return pos;
}

/**
 * Given a line number in the virtualized text, returns the corresponding
 * line in the ORIGINAL source — or `null` if the position is inside an
 * injected block.
 */
export function remapLine(virtualLine: number, deltas: readonly LineDelta[]): number | null {
  let line = virtualLine;
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i];
    if (!d) continue;
    const injectedStart = d.insertedAtLine;
    const injectedEnd = d.insertedAtLine + d.lineCount;
    if (line > injectedEnd) {
      line -= d.lineCount;
    } else if (line > injectedStart && line <= injectedEnd) {
      return null;
    }
  }
  return line;
}
