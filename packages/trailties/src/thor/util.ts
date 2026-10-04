import { rbModToS, rbObjAsString } from "@blazetrails/ruby-compat";

export function namespaceFromThorClass(constant: unknown): string {
  let name = (
    typeof constant === "function" ? rbModToS(constant as never) : rbObjAsString(constant)
  ).replace(/^Thor::Sandbox::/gm, "");
  name = snakeCase(name).replace(/:+/g, ":");
  return name;
}

export function snakeCase(str: string): string {
  if (/^[A-Z_]+$/m.test(str)) return str.toLowerCase();
  const lastMatch = str
    .replace(/\B[A-Z]/g, "_$&")
    .replace(/_+/g, "_")
    .match(/_*(.*)/)!;
  return lastMatch.at(-1)!.toLowerCase();
}
