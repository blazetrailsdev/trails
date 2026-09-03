import { NameError } from "@blazetrails/ruby-compat/name-error";

declare module "@blazetrails/ruby-compat/name-error" {
  interface NameError {
    missingName(): string | undefined;
    isMissingName(name: string | symbol): boolean;
  }
}

export function missingName(this: NameError): string | undefined {
  if (!this.message.startsWith("uninitialized constant ")) return undefined;
  const match = this.message.match(/((::)?([A-Z]\w*)(::[A-Z]\w*)*)$/);
  return match ? match[1] : undefined;
}

export function isMissingName(this: NameError, name: string | symbol): boolean {
  if (typeof name === "symbol") {
    return this.constantName !== undefined && this.constantName === name.description;
  }
  return this.missingName() === name;
}

NameError.prototype.missingName = missingName;
NameError.prototype.isMissingName = isMissingName;

export { NameError };
