import { groupBy, type Hash } from "@blazetrails/ruby-compat";
import { AddressListsParser } from "../parsers/address-lists-parser.js";
import { Address } from "./address.js";

export class AddressList {
  addresses: Address[];
  groupNames: string[];

  constructor(string: string | Uint8Array | null) {
    const addressList = AddressListsParser.parse(string);
    this.addresses = addressList.addresses.map((a: unknown) => new Address(a));
    this.groupNames = addressList.groupNames;
  }

  addressesGroupedByGroup(): Hash<string | null, Address[]> {
    return groupBy(
      this.addresses.filter((a) => a.group != null),
      (a) => a.group,
    );
  }
}
