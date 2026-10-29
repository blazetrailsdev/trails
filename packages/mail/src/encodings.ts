import { StandardError } from "@blazetrails/ruby-compat";
import type { TransferEncoding } from "./encodings/transfer-encoding.js";
import { Utilities } from "./utilities.js";

export class UnknownEncodingType extends StandardError {}

const transferEncodings: Record<string, typeof TransferEncoding> = Object.create(null);

export const Encodings = {
  register(name: string, cls: typeof TransferEncoding): void {
    transferEncodings[Encodings.getName(name)] = cls;
  },

  isDefined(name: string): boolean {
    return Encodings.getName(name) in transferEncodings;
  },

  getEncoding(name: string): typeof TransferEncoding | null {
    return transferEncodings[Encodings.getName(name)] ?? null;
  },

  getAll(): (typeof TransferEncoding)[] {
    return Object.values(transferEncodings);
  },

  getName(name: string): string {
    return Utilities.underscoreize(name).toLowerCase();
  },
};
