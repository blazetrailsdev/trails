import { Struct, include, rbModConstSet } from "@blazetrails/ruby-compat";
import { CoreExt } from "./core-ext.js";
import { MessagePack } from "./namespaces.js";
import type { Packer } from "./packer.js";

export class ExtensionValue extends Struct.new("type", "payload") {
  declare type: number;
  declare payload: string | Uint8Array;
  declare toMsgpack: typeof CoreExt.toMsgpack;

  /** @internal */
  protected toMsgpackWithPacker(packer: Packer): Packer {
    packer.writeExtension(this);
    return packer;
  }
}

include(ExtensionValue, CoreExt);
rbModConstSet(MessagePack, "ExtensionValue", ExtensionValue);
