import { LoadError } from "@blazetrails/ruby-compat/load-error";
import { rbClearMethodCache } from "@blazetrails/ruby-compat/method-cache";

declare module "@blazetrails/ruby-compat" {
  interface LoadError {
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
rbClearMethodCache();

export { LoadError };
