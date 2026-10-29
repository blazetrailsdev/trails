import { RuntimeError } from "@blazetrails/ruby-compat";
import { Encodings } from "../encodings.js";

export class TransferEncoding {
  static readonly NAME: string = "";
  static readonly PRIORITY: number = -1;

  static canTransport(enc: typeof TransferEncoding | null): boolean {
    return enc != null && (enc === this || enc.prototype instanceof this);
  }

  static canEncode(enc: typeof TransferEncoding | null): boolean {
    return this.canTransport(enc);
  }

  static cost(_str: string): number {
    throw new RuntimeError("Unimplemented");
  }

  static isCompatibleInput(_str: string): boolean {
    return true;
  }

  static toString(): string {
    return this.NAME;
  }

  static negotiate(
    messageEncoding: string | typeof TransferEncoding | null,
    sourceEncoding: string | typeof TransferEncoding | null,
    str: string,
    allowedEncodings: (typeof TransferEncoding)[] | null = null,
  ): typeof TransferEncoding | null {
    messageEncoding =
      Encodings.getEncoding(messageEncoding as string) ?? Encodings.getEncoding("8bit");
    sourceEncoding = Encodings.getEncoding(sourceEncoding as string);

    if (
      messageEncoding &&
      sourceEncoding &&
      messageEncoding.canTransport(sourceEncoding) &&
      sourceEncoding.isCompatibleInput(str)
    ) {
      return sourceEncoding;
    } else {
      return this.renegotiate(messageEncoding!, sourceEncoding, str, allowedEncodings);
    }
  }

  static renegotiate(
    messageEncoding: typeof TransferEncoding,
    sourceEncoding: typeof TransferEncoding | null,
    str: string,
    allowedEncodings: (typeof TransferEncoding)[] | null = null,
  ): typeof TransferEncoding | null {
    const encodings = Encodings.getAll().filter(
      (enc) =>
        (allowedEncodings == null || allowedEncodings.includes(enc)) &&
        messageEncoding.canTransport(enc) &&
        enc.canEncode(sourceEncoding),
    );

    return this.lowestCost(str, encodings);
  }

  static lowestCost(
    str: string,
    encodings: (typeof TransferEncoding)[],
  ): typeof TransferEncoding | null {
    let best: typeof TransferEncoding | null = null;
    let bestCost: number | null = null;

    for (const enc of encodings) {
      const thisCost = enc.isCompatibleInput(str) ? enc.cost(str) : null;

      if (bestCost == null || (thisCost != null && thisCost < bestCost)) {
        bestCost = thisCost;
        best = enc;
      } else if (thisCost === bestCost) {
        if (enc.PRIORITY < best!.PRIORITY) best = enc;
      }
    }

    return best;
  }
}
