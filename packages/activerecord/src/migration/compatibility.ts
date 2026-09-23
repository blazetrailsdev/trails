import { ArgumentError } from "@blazetrails/activemodel";
import { rbInspect } from "@blazetrails/ruby-compat";
import { Current } from "../migration.js";
import * as Compatibility from "./compatibility.js";
import { Migration } from "../namespaces.js";

export function find(version: string | number): unknown {
  version =
    typeof version === "number" && Number.isInteger(version) ? `${version}.0` : `${version}`;
  const name = `V${version.replaceAll(".", "_")}`;
  if (!Object.hasOwn(Compatibility, name)) {
    const versions = Object.keys(Compatibility)
      .filter((s) => /^V[0-9_]+$/.test(s))
      .map((s) => rbInspect(s.replace("V", "").replaceAll("_", ".")));
    throw new ArgumentError(
      `Unknown migration version ${rbInspect(version)}; expected one of ${versions.sort().join(", ")}`,
    );
  }
  return (Compatibility as Record<string, unknown>)[name];
}

export const V8_0 = Current;

export class V7_2 extends V8_0 {}

export class V7_1 extends V7_2 {}

Migration.Compatibility = Compatibility;
