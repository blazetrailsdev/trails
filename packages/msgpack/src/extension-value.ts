import { Struct, rbModConstSet } from "@blazetrails/ruby-compat";
import { CoreExt } from "./core-ext.js";
import { MessagePack } from "./namespaces.js";
import type { Packer } from "./packer.js";

export class ExtensionValue extends Struct.new("type", "payload") {
  declare type: number;
  declare payload: string | Uint8Array;

  /** @internal */
  static toMsgpackWithPacker(self: ExtensionValue, packer: Packer): Packer {
    packer.writeExtension(self);
    return packer;
  }

  toMsgpack(packerOrIo: unknown = null): Uint8Array | Packer | null {
    return CoreExt.toMsgpack.call(ExtensionValue, this, packerOrIo);
  }
}

rbModConstSet(MessagePack, "ExtensionValue", ExtensionValue);
