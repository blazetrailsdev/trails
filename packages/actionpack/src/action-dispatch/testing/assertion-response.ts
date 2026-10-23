import { ArgumentError } from "@blazetrails/ruby-compat";
import { HTTP_STATUS_CODES, statusCode as rackStatusCode } from "@blazetrails/rack";

const GENERIC_RESPONSE_CODES: Record<string, string> = {
  success: "2XX",
  missing: "404",
  redirect: "3XX",
  error: "5XX",
};

export class AssertionResponse {
  readonly code: number | string | null;
  readonly name: string | null;

  constructor(codeOrName: number | string) {
    if (typeof codeOrName === "string" && !/^\d/.test(codeOrName)) {
      this.name = codeOrName;
      this.code = codeFromName(codeOrName);
    } else {
      this.name = nameFromCode(codeOrName);
      this.code = codeOrName;
    }

    if (this.code == null) throw new ArgumentError(`Invalid response name: ${this.name}`);
    if (this.name == null) throw new ArgumentError(`Invalid response code: ${this.code}`);
  }

  codeAndName(): string {
    return `${this.code}: ${this.name}`;
  }
}

/** @internal */
function codeFromName(name: string): number | string | null {
  if (Object.hasOwn(GENERIC_RESPONSE_CODES, name)) return GENERIC_RESPONSE_CODES[name];
  try {
    return rackStatusCode(name);
  } catch {
    return null;
  }
}

/** @internal */
function nameFromCode(code: number | string): string | null {
  return (
    Object.keys(GENERIC_RESPONSE_CODES).find((name) => GENERIC_RESPONSE_CODES[name] === code) ??
    (typeof code === "number" ? HTTP_STATUS_CODES[code] : undefined) ??
    null
  );
}
