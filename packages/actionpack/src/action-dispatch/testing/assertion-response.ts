import { HTTP_STATUS_CODES, statusCode as rackStatusCode } from "@blazetrails/rack";

const GENERIC_RESPONSE_CODES: Record<string, string> = {
  success: "2XX",
  missing: "404",
  redirect: "3XX",
  error: "5XX",
};

export class AssertionResponse {
  readonly code: string;
  readonly name: string;

  constructor(codeOrName: number | string) {
    const isNumeric = typeof codeOrName === "number" || /^\d+$/.test(codeOrName);
    if (isNumeric) {
      const code = typeof codeOrName === "number" ? codeOrName : parseInt(codeOrName, 10);
      const n = nameFromCode(code);
      if (n === undefined) {
        throw new Error(`Invalid response code: ${codeOrName}`);
      }
      this.name = n;
      this.code = String(codeOrName);
    } else {
      this.name = codeOrName;
      const c = codeFromName(codeOrName);
      if (c === undefined) {
        throw new Error(`Invalid response name: ${codeOrName}`);
      }
      this.code = c;
    }
  }

  codeAndName(): string {
    return `${this.code}: ${this.name}`;
  }
}

/** @internal */
function codeFromName(name: string): string | undefined {
  if (Object.hasOwn(GENERIC_RESPONSE_CODES, name)) return GENERIC_RESPONSE_CODES[name];
  try {
    return String(rackStatusCode(name));
  } catch {
    return undefined;
  }
}

/** @internal */
function nameFromCode(code: number): string | undefined {
  return HTTP_STATUS_CODES[code];
}
