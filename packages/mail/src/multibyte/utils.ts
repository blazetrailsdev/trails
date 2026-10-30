import { Encoding, forceEncoding, rbObjEncoding, rbObjDup } from "@blazetrails/ruby-compat";
import { EncodingError } from "./encoding-error.js";

/** @internal */
export interface MultibyteHost {
  VALID_CHARACTER: Record<string, RegExp>;
  verify(string: string | Uint8Array): boolean;
  toUtf8(string: string | Uint8Array): string | Uint8Array;
}

export function validCharacter(this: MultibyteHost): RegExp | undefined {
  return this.VALID_CHARACTER[Encoding.defaultExternal.toString()];
}

export function isUtf8(this: MultibyteHost, string: string | Uint8Array): boolean {
  switch (rbObjEncoding(string)) {
    case Encoding.UTF_8:
      return this.verify(string);
    case Encoding.ASCII_8BIT:
    case Encoding.US_ASCII:
      return this.verify(this.toUtf8(string));
    default:
      return false;
  }
}

/** @inventedArm if — PERMANENT */
export function verify(string: string | Uint8Array): boolean {
  if (typeof string !== "string") return rbObjEncoding(string) === Encoding.ASCII_8BIT;
  return !/\p{Cs}/u.test(string);
}

export function verifyBang(this: MultibyteHost, string: string | Uint8Array): void {
  if (!this.verify(string)) throw new EncodingError("Found characters with invalid encoding");
}

export function clean(string: string): string {
  return string;
}

export function toUtf8(string: string | Uint8Array): string | Uint8Array {
  return forceEncoding(rbObjDup(string), Encoding.UTF_8);
}
