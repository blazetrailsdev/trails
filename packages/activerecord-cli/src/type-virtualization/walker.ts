import * as ts from "typescript/unstable/ast";

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
  paramsAfterThis: string[];
}

export interface EnumCall {
  kind: "enum";
  attr: string;
  values: string[];
  options: RecordLiteral;
}

export interface AliasAttributeCall {
  kind: "aliasAttribute";
  name: string;
  target: string;
}

export type RuntimeCall =
  | AttributeCall
  | AssociationCall
  | ScopeCall
  | EnumCall
  | AliasAttributeCall;

/** @internal */
export interface IncludeCall {
  className: string;
  moduleExpr: string;
  classExported: boolean;
  classTypeParams: string;
}

export type RecordLiteral = Record<string, string>;

export interface ClassInfo {
  name: string;
  classDecl: ts.ClassDeclaration;
  openBracePos: number;
  calls: RuntimeCall[];
  existingMembers: Set<string>;
  existingStaticMembers: Set<string>;
  existingMemberTypes: Map<string, string>;
  skip: boolean;
  noSchema: boolean;
  abstract: boolean;
  dynamicTableName: boolean;
  skipSchemaColumns: Set<string>;
  tableName?: string;
}

export interface WalkOptions {
  baseNames?: readonly string[];
  isModelClass?: (cls: ts.ClassDeclaration) => boolean;
}

export function walk(sourceFile: ts.SourceFile, opts: WalkOptions = {}): ClassInfo[] {
  const baseNames = new Set(opts.baseNames ?? ["Base"]);
  const out: ClassInfo[] = [];

  const isModel = opts.isModelClass ?? ((cls: ts.ClassDeclaration) => extendsOneOf(cls, baseNames));
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name && isModel(node)) {
      out.push(buildClassInfo(node, sourceFile));
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);

  const visitModelEnum = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node)) {
      const call = node.expression;
      if (
        ts.isCallExpression(call) &&
        ts.isPropertyAccessExpression(call.expression) &&
        ts.isIdentifier(call.expression.expression) &&
        call.expression.name.text === "enum"
      ) {
        const enumCall = readEnumCall(call);
        if (enumCall) {
          const info = resolveLexicalClassInfo(out, node, call.expression.expression.text);
          if (info) info.calls.push(enumCall);
        }
      }
    }
    node.forEachChild(visitModelEnum);
  };
  visitModelEnum(sourceFile);

  recordMergedInterfaceMembers(sourceFile, out);

  return out;
}

function recordMergedInterfaceMembers(sourceFile: ts.SourceFile, out: readonly ClassInfo[]): void {
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node)) {
      for (const info of out) {
        if (info.name !== node.name.text) continue;
        for (const m of node.members) {
          const name = (m as Partial<ts.NamedMemberBase>).name;
          if (!name) continue;
          if (ts.isIdentifier(name) || ts.isStringLiteralLikeNode(name)) {
            info.existingMembers.add(name.text);
            const type = (m as { type?: ts.TypeNode }).type;
            if (m.kind === ts.SyntaxKind.PropertySignature && type) {
              info.existingMemberTypes.set(name.text, type.getText());
            }
          }
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
}

function resolveLexicalClassInfo(
  out: readonly ClassInfo[],
  usage: ts.Node,
  name: string,
): ClassInfo | undefined {
  for (let node: ts.Node | undefined = usage.parent; node; node = node.parent) {
    const statements = ts.isSourceFile(node)
      ? node.statements
      : ts.isBlock(node) || ts.isModuleBlock(node)
        ? node.statements
        : undefined;
    if (!statements) continue;
    for (const stmt of statements) {
      if (ts.isClassDeclaration(stmt) && stmt.name?.text === name) {
        const info = out.find((c) => c.classDecl === stmt);
        if (info) return info;
      }
    }
  }
  return out.find((c) => c.name === name);
}

function buildClassInfo(cls: ts.ClassDeclaration, sourceFile: ts.SourceFile): ClassInfo {
  const info: ClassInfo = {
    name: cls.name!.text,
    classDecl: cls,
    openBracePos: findOpenBrace(sourceFile.text, cls),
    calls: [],
    existingMembers: new Set(),
    existingStaticMembers: new Set(),
    existingMemberTypes: new Map(),
    skip: hasSkipMarker(cls, sourceFile),
    noSchema: hasMarker(cls, sourceFile, /@trails-typegen\s+no-schema\b/),
    abstract: false,
    dynamicTableName: false,
    skipSchemaColumns: parseSkipColumns(cls, sourceFile),
  };

  if (info.skip) return info;

  for (const member of cls.members) {
    recordExistingMember(member, info);
    if (ts.isClassStaticBlockDeclaration(member)) {
      for (const s of member.body.statements) {
        readStaticAssignment(s, info);
        const call = readThisCall(s);
        if (call) info.calls.push(call);
      }
    }
  }

  return info;
}

function extendsOneOf(cls: ts.ClassDeclaration, names: Set<string>): boolean {
  for (const hc of cls.heritageClauses ?? []) {
    if (hc.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    for (const t of hc.types) {
      if (!ts.isExpressionWithTypeArguments(t)) continue;
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
  return hasMarker(cls, sf, /@trails-typegen\s+skip(?!-)/);
}

function hasMarker(cls: ts.ClassDeclaration, sf: ts.SourceFile, pattern: RegExp): boolean {
  const ranges = ts.getLeadingCommentRanges(sf.text, cls.pos) ?? [];
  for (const r of ranges) {
    if (pattern.test(sf.text.slice(r.pos, r.end))) return true;
  }
  return false;
}

function readStaticAssignment(stmt: ts.Statement, info: ClassInfo): void {
  if (!ts.isExpressionStatement(stmt)) return;
  const expr = stmt.expression;
  if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
  const left = expr.left;
  if (!ts.isPropertyAccessExpression(left)) return;
  if (left.expression.kind !== ts.SyntaxKind.ThisKeyword) return;
  readStaticValue(left.name.text, expr.right, info);
}

function readStaticValue(name: string, value: ts.Expression, info: ClassInfo): void {
  if (name === "tableName") {
    const literal = ts.isStringLiteralLikeNode(value);
    info.tableName = literal ? value.text : undefined;
    info.dynamicTableName = !literal;
  }
  if (name === "abstractClass" && value.kind === ts.SyntaxKind.TrueKeyword) info.abstract = true;
}

function parseSkipColumns(cls: ts.ClassDeclaration, sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const ranges = ts.getLeadingCommentRanges(sf.text, cls.pos) ?? [];
  for (const r of ranges) {
    const text = sf.text.slice(r.pos, r.end);
    const m = /@trails-typegen\s+skip-columns:\s*([^\n*]+)/.exec(text);
    if (m && m[1]) {
      for (const col of m[1].split(",")) {
        const trimmed = col.trim();
        if (trimmed) out.add(trimmed);
      }
    }
  }
  return out;
}

function recordExistingMember(m: ts.ClassElement, info: ClassInfo): void {
  const member = m as Partial<ts.NamedMemberBase>;
  let name: string | undefined;
  if (member.name) {
    if (ts.isIdentifier(member.name)) name = member.name.text;
    else if (ts.isStringLiteralLikeNode(member.name)) name = member.name.text;
  }
  if (!name) return;
  const modifiers = member.modifiers;
  const isStatic = modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword) ?? false;
  if (isStatic) info.existingStaticMembers.add(name);
  else info.existingMembers.add(name);

  if (!ts.isPropertyDeclaration(m)) return;
  if (isStatic && m.initializer) readStaticValue(name, m.initializer, info);
  if (!isStatic && m.type) info.existingMemberTypes.set(name, m.type.getText());
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
    case "aliasAttribute":
      return readAliasAttributeCall(call);
    default:
      return null;
  }
}

function readAttributeCall(call: ts.CallExpression): AttributeCall | null {
  const [nameArg, typeArg, optsArg] = call.arguments;
  if (!nameArg || !ts.isStringLiteralLikeNode(nameArg)) return null;
  if (!typeArg || !ts.isStringLiteralLikeNode(typeArg)) return null;
  return {
    kind: "attribute",
    name: nameArg.text,
    railsType: typeArg.text,
    options: readRecordLiteral(optsArg),
  };
}

function readAliasAttributeCall(call: ts.CallExpression): AliasAttributeCall | null {
  const [newArg, oldArg] = call.arguments;
  if (!newArg || !ts.isStringLiteralLikeNode(newArg)) return null;
  if (!oldArg || !ts.isStringLiteralLikeNode(oldArg)) return null;
  return { kind: "aliasAttribute", name: newArg.text, target: oldArg.text };
}

function readAssociationCall(
  kind: AssociationKind,
  call: ts.CallExpression,
): AssociationCall | null {
  const [nameArg, optsArg] = call.arguments;
  if (!nameArg || !ts.isStringLiteralLikeNode(nameArg)) return null;
  return {
    kind,
    name: nameArg.text,
    options: readRecordLiteral(optsArg),
  };
}

function readScopeCall(call: ts.CallExpression): ScopeCall | null {
  const [nameArg, fnArg] = call.arguments;
  if (!nameArg || !ts.isStringLiteralLikeNode(nameArg)) return null;
  if (!fnArg) return { kind: "scope", name: nameArg.text, paramsAfterThis: [] };
  if (!ts.isArrowFunction(fnArg) && !ts.isFunctionExpression(fnArg)) {
    return { kind: "scope", name: nameArg.text, paramsAfterThis: [] };
  }
  const params = fnArg.parameters;
  const rest = params.length > 0 && params[0].name.getText() === "this" ? params.slice(1) : params;
  return {
    kind: "scope",
    name: nameArg.text,
    paramsAfterThis: rest.map(renderScopeParam),
  };
}

function renderScopeParam(p: ts.ParameterDeclaration): string {
  const name = p.name.getText();
  if (p.dotDotDotToken) return `...${name}: ${p.type ? p.type.getText() : "unknown[]"}`;
  const optional = p.questionToken != null || p.initializer != null ? "?" : "";
  if (p.type) return `${name}${optional}: ${p.type.getText()}`;
  if (!p.initializer) return `${name}: unknown`;
  return `${name}${optional}: ${inferLiteralType(p.initializer)}`;
}

function inferLiteralType(expr: ts.Expression): string {
  switch (expr.kind) {
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
      return "boolean";
    case ts.SyntaxKind.NumericLiteral:
      return "number";
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return "string";
    default:
      return "unknown";
  }
}

function readEnumCall(call: ts.CallExpression): EnumCall | null {
  const [attrArg, mapArg, optsArg] = call.arguments;
  if (!attrArg || !ts.isStringLiteralLikeNode(attrArg)) return null;
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
      if (!ts.isStringLiteralLikeNode(el)) return null;
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
      prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteralLikeNode(prop.name))
        ? prop.name.text
        : null;
    if (!key) continue;
    out[key] = prop.initializer.getText();
  }
  return out;
}

/** @internal */
export function findIncludeCalls(sourceFile: ts.SourceFile): IncludeCall[] {
  let includeImported = false;
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteralLikeNode(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== "@blazetrails/activesupport") continue;
    const named = stmt.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        const importedName = el.propertyName?.text ?? el.name.text;
        if (importedName === "include" && el.name.text === "include") includeImported = true;
      }
    }
  }
  if (!includeImported) return [];

  interface DeclaredClass {
    exported: boolean;
    typeParams: string;
  }
  const declaredClasses = new Map<string, DeclaredClass>();
  for (const stmt of sourceFile.statements) {
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
    const exported = (stmt.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    let typeParams = "";
    if (stmt.typeParameters && stmt.typeParameters.length > 0) {
      const first = stmt.typeParameters[0].pos;
      const last = stmt.typeParameters[stmt.typeParameters.length - 1].end;
      typeParams = `<${sourceFile.text.slice(first, last)}>`;
    }
    declaredClasses.set(stmt.name.text, { exported, typeParams });
  }

  const out: IncludeCall[] = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isExpressionStatement(stmt)) continue;
    const call = stmt.expression;
    if (!ts.isCallExpression(call)) continue;
    if (!ts.isIdentifier(call.expression) || call.expression.text !== "include") continue;
    const [classArg, modArg] = call.arguments;
    if (!classArg || !modArg) continue;
    if (!ts.isIdentifier(classArg)) continue;
    const meta = declaredClasses.get(classArg.text);
    if (!meta) continue;
    if (!isTypeofQueryable(modArg)) continue;
    out.push({
      className: classArg.text,
      moduleExpr: modArg.getText(),
      classExported: meta.exported,
      classTypeParams: meta.typeParams,
    });
  }
  return out;
}

function isTypeofQueryable(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return true;
  if (ts.isPropertyAccessExpression(expr)) return isTypeofQueryable(expr.expression);
  return false;
}

function objectKeys(obj: ts.ObjectLiteralExpression): string[] {
  const keys: string[] = [];
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLikeNode(p.name))) {
      keys.push(p.name.text);
    }
  }
  return keys;
}
