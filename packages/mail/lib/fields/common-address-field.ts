import {
  ArgumentError,
  isValidEncoding,
  forceEncoding,
  rbObjDup,
  rbObjEncoding,
  rbObjRespondTo,
  Encoding,
} from "@blazetrails/ruby-compat";
import { Address } from "../elements/address.js";
import { AddressList } from "../elements/address-list.js";
import { Encodings } from "../encodings.js";
import { Utilities } from "../utilities.js";
import { NamedStructuredField } from "./named-structured-field.js";

export class AddressContainer<T = unknown> extends Array<T> {
  /** @noRailsEquivalent PERMANENT */
  static get [Symbol.species](): ArrayConstructor {
    return Array;
  }

  /** @internal */
  private _field: CommonAddressField;

  constructor(field: CommonAddressField, list: readonly T[] | null = null) {
    super();
    this._field = field;
    if (list != null) this.push(...list);
  }

  append(address: unknown): unknown {
    return this._field.append(address);
  }
}

export class CommonAddressField extends NamedStructuredField {
  static override isSingular(): boolean {
    return true;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    super(new.target.prototype.encodeIfNeeded(value, charset), charset);
  }

  override element(): AddressList {
    return (this._element ??= new AddressList(this.value as string)) as AddressList;
  }

  each(block: (address: Address) => void): void {
    this.element().addresses.forEach((address) => {
      block(address);
    });
  }

  override default(): unknown {
    return this.addresses();
  }

  address(): string | null {
    return this.addresses()[0] ?? null;
  }

  addresses(): AddressContainer<string | null> | (string | null)[] {
    const list = this.element().addresses.map((a) => a.address());
    return new AddressContainer(this, list);
  }

  formatted(): AddressContainer<string> {
    const list = this.element().addresses.map((a) => a.format());
    return new AddressContainer(this, list);
  }

  displayNames(): AddressContainer<string | null> {
    const list = this.element().addresses.map((a) => a.displayName());
    return new AddressContainer(this, list);
  }

  addrs(): AddressContainer<Address> {
    const list = this.element().addresses;
    return new AddressContainer(this, list);
  }

  groups(): ReturnType<AddressList["addressesGroupedByGroup"]> {
    return this.element().addressesGroupedByGroup();
  }

  groupAddresses(): string[] {
    return this.decodedGroupAddresses();
  }

  decodedGroupAddresses(): string[] {
    return [...this.groups()].flatMap(([, v]) => v.map((a) => a.decoded));
  }

  encodedGroupAddresses(): string[] {
    return [...this.groups()].flatMap(([, v]) => v.map((a) => a.encoded));
  }

  groupNames(): string[] {
    return this.element().groupNames;
  }

  append(val: unknown): unknown {
    if (val == null) {
      throw new ArgumentError("Need to pass an address to <<");
    } else if (Utilities.isBlank(val)) {
      return this;
    } else {
      return (this.value = [this.value, this.encodeIfNeeded(val)]
        .filter((a) => !Utilities.isBlank(a))
        .join(", "));
    }
  }

  encodeIfNeeded(val: unknown, valCharset: unknown = this.charset): unknown {
    if (val == null) {
      return val;
    } else if (Array.isArray(val)) {
      return val
        .filter((x) => x != null)
        .map((a) => this.encodeIfNeeded(a, valCharset))
        .join(", ");
    } else {
      return (
        this.utf8IfNeeded(val as string, valCharset) ??
        Encodings.encodeNonUsascii(val as string, valCharset as string | null)
      );
    }
  }

  /** @internal */
  protected utf8IfNeeded(
    val: string | Uint8Array,
    valCharset: unknown,
  ): string | Uint8Array | null {
    let utf8: string | Uint8Array;
    if (/^UTF-?8$/i.test(String(valCharset ?? ""))) {
      return val;
    } else if (rbObjEncoding(val) === Encoding.UTF_8) {
      return val;
    } else if (
      isValidEncoding(
        (utf8 = forceEncoding(rbObjDup(val) as string, Encoding.UTF_8)),
        Encoding.UTF_8,
      )
    ) {
      return utf8;
    }
    return null;
  }

  /** @internal */
  doEncode(): string {
    if (Utilities.isBlank(this.value)) return "";
    const addressArray = this.element()
      .addresses.filter((a) => !this.encodedGroupAddresses().includes(a.encoded))
      .filter((x) => x != null)
      .map((a) => a.encoded);
    const addressText = addressArray.join(", \r\n ");
    const groupArray = [...this.groups()].map(
      ([k, v]) => `${k}: ${v.map((a) => a.encoded).join(", \r\n ")};`,
    );
    const groupText = groupArray.join(" \r\n ");
    const returnArray = [addressText, groupText].filter((a) => !Utilities.isBlank(a));
    return `${this.name}: ${returnArray.join(", \r\n ")}\r\n`;
  }

  /** @internal */
  doDecode(): unknown {
    if (Utilities.isBlank(this.value)) return null;
    const addressArray = this.element()
      .addresses.filter((a) => !this.decodedGroupAddresses().includes(a.decoded))
      .map((a) => a.decoded);
    const addressText = addressArray.join(", ");
    const groupArray = [...this.groups()].map(
      ([k, v]) => `${k}: ${v.map((a) => a.decoded).join(", ")};`,
    );
    const groupText = groupArray.join(" ");
    const returnArray = [addressText, groupText].filter((a) => !Utilities.isBlank(a));
    return returnArray.join(", ");
  }

  /** @internal */
  protected getGroupAddresses(groupList: unknown): Address[] {
    if (rbObjRespondTo(groupList, "addresses")) {
      return (groupList as { addresses: unknown[] }).addresses.map(
        (address) => new Address(address),
      );
    } else {
      return [];
    }
  }
}
