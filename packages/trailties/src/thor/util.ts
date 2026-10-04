import { rbModName } from "@blazetrails/ruby-compat";

export function namespaceFromThorClass(constant: object | string): string {
  constant = (typeof constant === "string" ? constant : (rbModName(constant) ?? "")).replace(
    /^Thor::Sandbox::/gm,
    "",
  );
  constant = snakeCase(constant).replace(/:+/g, ":");
  return constant;
}

export function snakeCase(str: string): string {
  if (/^[A-Z_]+$/m.test(str)) return str.toLowerCase();
  const lastMatch = str
    .replace(/\B[A-Z]/g, "_$&")
    .replace(/_+/g, "_")
    .match(/_*(.*)/)!;
  return lastMatch.at(-1)!.toLowerCase();
}
