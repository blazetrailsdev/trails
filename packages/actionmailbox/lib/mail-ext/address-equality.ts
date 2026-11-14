import { Address } from "@blazetrails/mail";

declare module "@blazetrails/mail/elements/address" {
  interface Address {
    equals(otherAddress: unknown): boolean;
  }
}

export function equals(this: Address, otherAddress: unknown): boolean {
  return otherAddress instanceof Address && this.toString() === otherAddress.toString();
}

Address.prototype.equals = equals;
