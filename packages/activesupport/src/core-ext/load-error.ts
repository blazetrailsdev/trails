import { LoadError } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat" {
  interface LoadError {
    path?: string | null;
    isMissing(location: string): boolean;
  }
}

export function isMissing(this: LoadError, location: string): boolean {
  return deleteSuffix(location, ".rb") === deleteSuffix(String(this.path ?? ""), ".rb");
}

function deleteSuffix(str: string, suffix: string): string {
  return str.endsWith(suffix) ? str.slice(0, -suffix.length) : str;
}

LoadError.prototype.isMissing = isMissing;

export { LoadError };
