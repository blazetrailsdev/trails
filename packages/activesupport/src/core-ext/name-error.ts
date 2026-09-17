import { ArgumentError } from "@blazetrails/ruby-compat";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { registeredConstantName } from "../inflector.js";

declare module "@blazetrails/ruby-compat/name-error" {
  interface NameError {
    missingName(): string | null;
    isMissingName(name: string): boolean;
  }
}

export function missingName(this: NameError): string | null {
  const message = this.message;
  if (!message.startsWith("uninitialized constant ")) return null;

  let receiver: unknown;
  try {
    receiver = this.receiver();
  } catch (e) {
    if (!(e instanceof ArgumentError)) throw e;
    receiver = null;
  }

  if (receiver === Object) {
    return String(this.constantName);
  } else if (receiver != null && receiver !== false) {
    return `${realModName(receiver)}::${this.constantName}`;
  } else {
    const match = message.match(/((::)?([A-Z]\w*)(::[A-Z]\w*)*)$/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export function isMissingName(this: NameError, name: string): boolean {
  if (name.startsWith(":")) {
    return this.constantName === name.slice(1);
  } else {
    return this.missingName() === String(name);
  }
}

/** @internal */
function realModName(mod: unknown): string | undefined {
  return registeredConstantName(mod) ?? (mod as { name?: string }).name;
}

NameError.prototype.missingName = missingName;
NameError.prototype.isMissingName = isMissingName;

export { NameError };
