function absent(name: string): never {
  throw new Error(
    "typescript/unstable." +
      name +
      " is not compiled into this native build; see perry/FINDINGS.md",
  );
}
export class API {
  constructor() {
    absent("sync.API");
  }
}
export const SyntaxKind: Record<string, number> = {};
export function createScanner(): never {
  return absent("ast.scanner.createScanner");
}
export function isStringLiteralLikeNode(): boolean {
  return false;
}
export function isTemplateHead(): boolean {
  return false;
}
export function isTemplateMiddle(): boolean {
  return false;
}
export function isTemplateTail(): boolean {
  return false;
}
export function isRegularExpressionLiteral(): boolean {
  return false;
}
