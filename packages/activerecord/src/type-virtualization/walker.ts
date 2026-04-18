// Syntactic walker for model source files.
//
// Finds top-level class declarations that extend a name in the allow-list
// (default: ["Base"]) and collects the runtime calls inside each class's
// static blocks — `this.attribute(...)`, `this.hasMany(...)`,
// `this.belongsTo(...)`, `this.hasOne(...)`, `this.hasAndBelongsToMany(...)`,
// `this.scope(...)`, `this.enum(...)` — plus top-level `defineEnum(this, ...)`
// statements whose first argument identifies the class.
//
// Intentionally does not resolve symbols or consult a `ts.Program`. Transitive
// extends (e.g. `class Admin extends User`) are handled by a separate,
// checker-backed pass that produces the allow-list.

import ts from "typescript";

export type AssociationKind = "hasMany" | "hasAndBelongsToMany" | "belongsTo" | "hasOne";

export interface AttributeCall {
  kind: "attribute";
  name: string;
  railsType: string;
  options: RecordLiteral;
}

export interface AssociationCall {
  kind: AssociationKind;
  name: string;
  options: RecordLiteral;
}

export interface ScopeCall {
  kind: "scope";
  name: string;
  // Parameter list of the inline scope function, with the leading `rel`
  // parameter removed. Each element is the raw source text of a parameter
  // (e.g. "limit: number", "name = \"draft\"").
  paramsAfterRel: string[];
}

export interface EnumCall {
  kind: "enum";
  attr: string;
  values: string[]; // string keys of the mapping literal
  options: RecordLiteral;
}

export interface DefineEnumCall {
  kind: "defineEnum";
  attr: string;
  values: string[];
  options: RecordLiteral;
}

export type RuntimeCall = AttributeCall | AssociationCall | ScopeCall | EnumCall | DefineEnumCall;

export type RecordLiteral = Record<string, string>;

export interface ClassInfo {
  name: string;
  classDecl: ts.ClassDeclaration;
  openBracePos: number; // char offset of the class body's `{` + 1
  calls: RuntimeCall[];
  // Member names the user has already declared by hand — the virtualizer
  // must skip injection for any of these.
  existingMembers: Set<string>;
  existingStaticMembers: Set<string>;
  skip: boolean; // `/** @trails-typegen skip */` JSDoc above the class
  /**
   * The `static tableName = "..."` value when the user declared it
   * explicitly. Used to look up schema columns in
   * `VirtualizeOptions.schemaColumnsByTable`. When absent, callers
   * should fall back to Rails' conventional inference
   * (`pluralize(underscore(className))`).
   */
  tableName?: string;
}

export interface WalkOptions {
  /** Class names counted as roots. Defaults to `["Base"]`. */
  baseNames?: readonly string[];
}

export function walk(sourceFile: ts.SourceFile, opts: WalkOptions = {}): ClassInfo[] {
  const baseNames = new Set(opts.baseNames ?? ["Base"]);
  const out: ClassInfo[] = [];

  for (const stmt of sourceFile.statements) {
    if (!ts.isClassDeclaration(stmt)) continue;
    if (!stmt.name) continue;
    if (!extendsOneOf(stmt, baseNames)) continue;

    const info: ClassInfo = {
      name: stmt.name.text,
      classDecl: stmt,
      openBracePos: findOpenBrace(sourceFile.text, stmt),
      calls: [],
      existingMembers: new Set(),
      existingStaticMembers: new Set(),
      skip: hasSkipMarker(stmt, sourceFile),
    };

    if (info.skip) {
      out.push(info);
      continue;
    }

    for (const member of stmt.members) {
      recordExistingMember(member, info);
      if (ts.isClassStaticBlockDeclaration(member)) {
        for (const s of member.body.statements) {
          const call = readThisCall(s);
          if (call) {
            info.calls.push(call);
            continue;
          }
          // Static-block `defineEnum(this, "status", { ... })` —
          // Rails-idiomatic authoring form (matches Ruby's
          // `enum :status, ...` inside the class body). Walker also
          // supports the top-level `defineEnum(ClassName, ...)` form
          // below.
          const defineEnumCall = readDefineEnumThisCall(s);
          if (defineEnumCall) info.calls.push(defineEnumCall);
        }
      }
    }

    out.push(info);
  }

  // Top-level `defineEnum(ClassName, ...)` calls. Supports both the array
  // form (`["draft", "published"]`) and the object form
  // (`{ draft: 0, published: 1 }`).
  for (const stmt of sourceFile.statements) {
    if (!ts.isExpressionStatement(stmt)) continue;
    const call = stmt.expression;
    if (!ts.isCallExpression(call)) continue;
    if (!ts.isIdentifier(call.expression) || call.expression.text !== "defineEnum") continue;
    const [targetArg, attrArg, mapArg, optsArg] = call.arguments;
    if (!targetArg || !attrArg || !mapArg) continue;
    if (!ts.isStringLiteralLike(attrArg)) continue;
    const values = readEnumValues(mapArg);
    if (!values) continue;
    const targetName = ts.isIdentifier(targetArg) ? targetArg.text : null;
    if (!targetName) continue;
    const info = out.find((c) => c.name === targetName);
    if (!info) continue;
    info.calls.push({
      kind: "defineEnum",
      attr: attrArg.text,
      values,
      options: readRecordLiteral(optsArg),
    });
  }

  return out;
}

function extendsOneOf(cls: ts.ClassDeclaration, names: Set<string>): boolean {
  for (const hc of cls.heritageClauses ?? []) {
    if (hc.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    for (const t of hc.types) {
      const expr = t.expression;
      if (ts.isIdentifier(expr) && names.has(expr.text)) return true;
    }
  }
  return false;
}

function findOpenBrace(text: string, cls: ts.ClassDeclaration): number {
  const after = cls.name?.end ?? cls.pos;
  const idx = text.indexOf("{", after);
  return idx === -1 ? -1 : idx + 1;
}

function hasSkipMarker(cls: ts.ClassDeclaration, sf: ts.SourceFile): boolean {
  const ranges = ts.getLeadingCommentRanges(sf.text, cls.pos) ?? [];
  for (const r of ranges) {
    const text = sf.text.slice(r.pos, r.end);
    if (/@trails-typegen\s+skip\b/.test(text)) return true;
  }
  return false;
}

function recordExistingMember(m: ts.ClassElement, info: ClassInfo): void {
  // Accept identifier AND string-literal member names so user-authored
  // quoted members (e.g. `declare "strange-col": string;`) de-dupe
  // against schema-emitted quoted declares.
  let name: string | undefined;
  if (m.name) {
    if (ts.isIdentifier(m.name)) name = m.name.text;
    else if (ts.isStringLiteralLike(m.name)) name = m.name.text;
  }
  if (!name) return;
  const modifiers = ts.canHaveModifiers(m) ? ts.getModifiers(m) : undefined;
  const isStatic = modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) ?? false;
  if (isStatic) info.existingStaticMembers.add(name);
  else info.existingMembers.add(name);

  // Capture `static tableName = "..."` for schema-column lookup.
  if (
    isStatic &&
    name === "tableName" &&
    ts.isPropertyDeclaration(m) &&
    m.initializer &&
    ts.isStringLiteralLike(m.initializer)
  ) {
    info.tableName = m.initializer.text;
  }
}

function readDefineEnumThisCall(stmt: ts.Statement): DefineEnumCall | null {
  if (!ts.isExpressionStatement(stmt)) return null;
  const call = stmt.expression;
  if (!ts.isCallExpression(call)) return null;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== "defineEnum") return null;
  const [targetArg, attrArg, mapArg, optsArg] = call.arguments;
  if (!targetArg || targetArg.kind !== ts.SyntaxKind.ThisKeyword) return null;
  if (!attrArg || !ts.isStringLiteralLike(attrArg)) return null;
  if (!mapArg) return null;
  const values = readEnumValues(mapArg);
  if (!values) return null;
  return {
    kind: "defineEnum",
    attr: attrArg.text,
    values,
    options: readRecordLiteral(optsArg),
  };
}

function readThisCall(stmt: ts.Statement): RuntimeCall | null {
  if (!ts.isExpressionStatement(stmt)) return null;
  const call = stmt.expression;
  if (!ts.isCallExpression(call)) return null;
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  if (callee.expression.kind !== ts.SyntaxKind.ThisKeyword) return null;
  const method = callee.name.text;

  switch (method) {
    case "attribute":
      return readAttributeCall(call);
    case "hasMany":
    case "hasAndBelongsToMany":
    case "belongsTo":
    case "hasOne":
      return readAssociationCall(method, call);
    case "scope":
      return readScopeCall(call);
    case "enum":
      return readEnumCall(call);
    default:
      return null;
  }
}

function readAttributeCall(call: ts.CallExpression): AttributeCall | null {
  const [nameArg, typeArg, optsArg] = call.arguments;
  if (!nameArg || !ts.isStringLiteralLike(nameArg)) return null;
  if (!typeArg || !ts.isStringLiteralLike(typeArg)) return null;
  return {
    kind: "attribute",
    name: nameArg.text,
    railsType: typeArg.text,
    options: readRecordLiteral(optsArg),
  };
}

function readAssociationCall(
  kind: AssociationKind,
  call: ts.CallExpression,
): AssociationCall | null {
  const [nameArg, optsArg] = call.arguments;
  if (!nameArg || !ts.isStringLiteralLike(nameArg)) return null;
  return {
    kind,
    name: nameArg.text,
    options: readRecordLiteral(optsArg),
  };
}

function readScopeCall(call: ts.CallExpression): ScopeCall | null {
  const [nameArg, fnArg] = call.arguments;
  if (!nameArg || !ts.isStringLiteralLike(nameArg)) return null;
  if (!fnArg) return { kind: "scope", name: nameArg.text, paramsAfterRel: [] };
  if (!ts.isArrowFunction(fnArg) && !ts.isFunctionExpression(fnArg)) {
    return { kind: "scope", name: nameArg.text, paramsAfterRel: [] };
  }
  const [, ...rest] = fnArg.parameters;
  return {
    kind: "scope",
    name: nameArg.text,
    paramsAfterRel: rest.map((p) => p.getText()),
  };
}

function readEnumCall(call: ts.CallExpression): EnumCall | null {
  const [attrArg, mapArg, optsArg] = call.arguments;
  if (!attrArg || !ts.isStringLiteralLike(attrArg)) return null;
  if (!mapArg) return null;
  const values = readEnumValues(mapArg);
  if (!values) return null;
  return {
    kind: "enum",
    attr: attrArg.text,
    values,
    options: readRecordLiteral(optsArg),
  };
}

function readEnumValues(node: ts.Expression): string[] | null {
  if (ts.isObjectLiteralExpression(node)) return objectKeys(node);
  if (ts.isArrayLiteralExpression(node)) {
    const out: string[] = [];
    for (const el of node.elements) {
      if (!ts.isStringLiteralLike(el)) return null;
      out.push(el.text);
    }
    return out;
  }
  return null;
}

function readRecordLiteral(node: ts.Expression | undefined): RecordLiteral {
  if (!node || !ts.isObjectLiteralExpression(node)) return {};
  const out: RecordLiteral = {};
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key =
      prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name))
        ? prop.name.text
        : null;
    if (!key) continue;
    out[key] = prop.initializer.getText();
  }
  return out;
}

function objectKeys(obj: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = [];
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) {
      keys.push(p.name.text);
    }
  }
  return keys;
}
