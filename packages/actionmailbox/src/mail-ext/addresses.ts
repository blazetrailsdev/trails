import { Address, Message, type AddressList } from "@blazetrails/mail";
import { rbFArray, rbObjAsString, rbObjRespondTo } from "@blazetrails/ruby-compat";

declare module "@blazetrails/mail/message" {
  interface Message {
    fromAddress(): Address | null;
    recipientsAddresses(): Address[];
    toAddresses(): Address[];
    ccAddresses(): Address[];
    bccAddresses(): Address[];
    xOriginalToAddresses(): Address[];
    xForwardedToAddresses(): Address[];
    /** @internal */
    addressList(obj: unknown): AddressList | null;
  }
}

export function fromAddress(this: Message): Address | null {
  return this.addressList(this.header().get("from"))?.addresses[0] ?? null;
}

export function recipientsAddresses(this: Message): Address[] {
  return [
    ...this.toAddresses(),
    ...this.ccAddresses(),
    ...this.bccAddresses(),
    ...this.xOriginalToAddresses(),
    ...this.xForwardedToAddresses(),
  ];
}

export function toAddresses(this: Message): Address[] {
  return rbFArray(this.addressList(this.header().get("to"))?.addresses) as Address[];
}

export function ccAddresses(this: Message): Address[] {
  return rbFArray(this.addressList(this.header().get("cc"))?.addresses) as Address[];
}

export function bccAddresses(this: Message): Address[] {
  return rbFArray(this.addressList(this.header().get("bcc"))?.addresses) as Address[];
}

export function xOriginalToAddresses(this: Message): Address[] {
  return rbFArray(this.header().get("x_original_to")).map(
    (header) => new Address(rbObjAsString(header)),
  );
}

export function xForwardedToAddresses(this: Message): Address[] {
  return rbFArray(this.header().get("x_forwarded_to")).map(
    (header) => new Address(rbObjAsString(header)),
  );
}

/** @internal */
function addressList(this: Message, obj: unknown): AddressList | null {
  if (rbObjRespondTo(obj, "element")) {
    return (obj as { element(): AddressList }).element();
  } else {
    return (obj as { addressList(): AddressList } | null)?.addressList() ?? null;
  }
}

Object.assign(Message.prototype, {
  fromAddress,
  recipientsAddresses,
  toAddresses,
  ccAddresses,
  bccAddresses,
  xOriginalToAddresses,
  xForwardedToAddresses,
  addressList,
});
