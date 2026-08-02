/**
 * Drift lint: a mixed-in module class vs the adapter interface that declares it.
 *
 * `include()` installs a mixin class's methods on the adapter prototype at
 * runtime. TypeScript cannot see them on the class type, so each adapter
 * restates the mixed-in surface in a declaration-merged
 * `export interface <Adapter> { ... }`. Declaration merging never checks that
 * interface against the mixin: change a signature in the mixin class and the
 * adapter's declared type silently goes stale, leaving call sites typed against
 * a signature that no longer exists.
 *
 * `Included<>` from @blazetrails/activesupport does not close this: for a class
 * module `keyof` widens to `string`, so the mapped type collapses to `{}` with
 * no error and every call falls back to the base signature.
 *
 * This module compares the two by source signature. Only names present in BOTH
 * the interface and the mixin's public instance methods are compared — an
 * interface member sourced from somewhere else (a concrete subclass) is not the
 * mixin's business, and a mixin method the interface omits is a safe failure
 * (call sites error rather than typecheck against a lie).
 *
 * Constraints: no `node:` specifiers, no `process` references.
 */

import ts from "typescript";

export interface SignatureEntry {
  name: string;
  signature: string;
}

export interface Drift {
  name: string;
  mixin: string;
  declared: string;
}

function parse(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true);
}

/**
 * Type text with every space and leading union pipe removed, so the two
 * declarations compare on what they mean rather than on how Prettier happened
 * to wrap them.
 */
function typeText(node: ts.TypeNode | undefined): string | null {
  if (!node) return null;
  return node.getText().replace(/\s+/g, "").replace(/^\|/, "").replace(/;\}/g, "}"); // trailing member separator Prettier adds when a type literal wraps
}

/**
 * Normalized signature: type parameters, parameters, return type. Class-only
 * spellings that an interface cannot express are erased so they never read as
 * drift — a `this` parameter, a defaulted parameter (which the interface spells
 * `?`), and the `_` prefix an unused parameter carries.
 *
 * A parameter typed only by inference (`columnName = "id"`) has no annotation to
 * compare, so its type is `null` — a wildcard the declared side always matches.
 */
function signatureOf(node: ts.SignatureDeclarationBase): string {
  const typeParams = node.typeParameters?.length
    ? `<${node.typeParameters.map((p) => p.getText().replace(/\s+/g, "")).join(",")}>`
    : "";
  const params = node.parameters
    .filter((p) => !(ts.isIdentifier(p.name) && p.name.text === "this"))
    .map((p) => {
      const dots = p.dotDotDotToken ? "..." : "";
      const optional = p.questionToken || p.initializer ? "?" : "";
      const name = p.name.getText().replace(/^_+/, "");
      const type = p.type ? typeText(p.type) : p.initializer ? WILDCARD : "";
      return `${dots}${name}${optional}: ${type}`;
    })
    .join(", ");
  return `${typeParams}(${params}): ${typeText(node.type) ?? ""}`;
}

/** Stands in for a parameter type TypeScript infers rather than spells. */
const WILDCARD = "*";

function isPublicInstanceMethod(member: ts.ClassElement): member is ts.MethodDeclaration {
  if (!ts.isMethodDeclaration(member)) return false;
  const modifiers = ts.getModifiers(member) ?? [];
  return !modifiers.some(
    (m) =>
      m.kind === ts.SyntaxKind.PrivateKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword ||
      m.kind === ts.SyntaxKind.StaticKeyword,
  );
}

/** Public instance-method signatures of `className` in `source`. */
export function mixinSignatures(
  fileName: string,
  source: string,
  className: string,
): SignatureEntry[] {
  const entries: SignatureEntry[] = [];
  for (const statement of parse(fileName, source).statements) {
    if (!ts.isClassDeclaration(statement) || statement.name?.text !== className) continue;
    for (const member of statement.members) {
      if (!isPublicInstanceMethod(member)) continue;
      const name = member.name.getText();
      if (name.startsWith("#")) continue;
      entries.push({ name, signature: signatureOf(member) });
    }
  }
  return entries;
}

/**
 * A member whose leading comment carries `drift-ok:` declares a signature that
 * deliberately differs from the mixin's — a concrete subclass widening the
 * return type, say — and states why right there. It is exempt from the diff.
 */
export const WAIVER = "drift-ok:";

function isWaived(source: string, member: ts.TypeElement): boolean {
  return (ts.getLeadingCommentRanges(source, member.pos) ?? []).some((range) =>
    source.slice(range.pos, range.end).includes(WAIVER),
  );
}

/** Method-member signatures of `interface <interfaceName>` in `source`. */
export function interfaceSignatures(
  fileName: string,
  source: string,
  interfaceName: string,
): SignatureEntry[] {
  const entries: SignatureEntry[] = [];
  for (const statement of parse(fileName, source).statements) {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== interfaceName) continue;
    for (const member of statement.members) {
      if (!ts.isMethodSignature(member) || isWaived(source, member)) continue;
      entries.push({ name: member.name.getText(), signature: signatureOf(member) });
    }
  }
  return entries;
}

/** Signature equality, with the mixin's inferred-type wildcards matching anything. */
export function matches(mixinSignature: string, declaredSignature: string): boolean {
  if (!mixinSignature.includes(WILDCARD)) return mixinSignature === declaredSignature;
  const pattern = mixinSignature
    .split(WILDCARD)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*?");
  return new RegExp(`^${pattern}$`).test(declaredSignature);
}

/**
 * Names declared by the interface whose signature no longer matches the mixin's.
 * A name the interface declares more than once is an overload set, which a
 * single mixin method cannot be compared against — those are skipped.
 */
export function findDrift(mixin: SignatureEntry[], declared: SignatureEntry[]): Drift[] {
  const mixinByName = new Map<string, SignatureEntry[]>();
  for (const entry of mixin) {
    mixinByName.set(entry.name, [...(mixinByName.get(entry.name) ?? []), entry]);
  }
  const declaredByName = new Map<string, SignatureEntry[]>();
  for (const entry of declared) {
    declaredByName.set(entry.name, [...(declaredByName.get(entry.name) ?? []), entry]);
  }

  const drift: Drift[] = [];
  for (const [name, declaredEntries] of declaredByName) {
    const mixinEntries = mixinByName.get(name);
    if (!mixinEntries || mixinEntries.length !== 1 || declaredEntries.length !== 1) continue;
    if (matches(mixinEntries[0].signature, declaredEntries[0].signature)) continue;
    drift.push({
      name,
      mixin: mixinEntries[0].signature,
      declared: declaredEntries[0].signature,
    });
  }
  return drift.sort((a, b) => a.name.localeCompare(b.name));
}
