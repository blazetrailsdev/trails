import { camelize } from "@blazetrails/activesupport";
import { ArgumentError, hasSecurePassword } from "@blazetrails/activemodel";
import { partition, toH } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

export { hasSecurePassword };

export async function authenticateBy(
  this: typeof Base,
  attributes: Record<string, unknown> | { toH(): Record<string, unknown> },
): Promise<Base | null> {
  const [passwords, identifiers] = partition(
    Object.entries(toH(attributes)),
    ([name]) => !this.hasAttribute(name) && this.hasAttribute(`${name}_digest`),
  ).map((pairs) => Object.fromEntries(pairs));

  if (Object.keys(passwords).length === 0) {
    throw new ArgumentError("One or more password arguments are required");
  }
  if (Object.keys(identifiers).length === 0) {
    throw new ArgumentError("One or more finder arguments are required");
  }

  if (Object.values(passwords).some((value) => value == null || value === "")) return null;

  const record = (await (this as unknown as { findBy(h: object): Promise<Base | null> }).findBy(
    identifiers,
  )) as (Base & Record<string, (value: unknown) => unknown>) | null;
  if (record) {
    const count = Object.entries(passwords).filter(([name, value]) =>
      record[`authenticate${camelize(name)}`].call(record, value),
    ).length;
    return count === Object.keys(passwords).length ? record : null;
  } else {
    new (this as unknown as new (attributes: object) => Base)(passwords);
    return null;
  }
}
