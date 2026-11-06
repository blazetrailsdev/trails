import { Address } from "@blazetrails/mail";

declare module "@blazetrails/mail/elements/address" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Address {
    let wrap: (address: unknown) => Address;
  }
}

export function wrap(address: unknown): Address {
  return address instanceof Address ? address : new Address(address);
}

Address.wrap = wrap;
