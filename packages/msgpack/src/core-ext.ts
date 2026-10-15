import {
  Hash as RubyHash,
  include,
  rbCArray,
  rbCFalseClass,
  rbCFloat,
  rbCInteger,
  rbCNilClass,
  rbCString,
  rbCSymbol,
  rbCTrueClass,
  rbFSend,
  rbModConstSet,
  rbModDefineMethod,
  rbObjIsKindOf,
} from "@blazetrails/ruby-compat";
import { MessagePack } from "./namespaces.js";
import type { Packer } from "./packer.js";

export const CoreExt = {
  name: "MessagePack::CoreExt",
  toMsgpack(this: unknown, packerOrIo: unknown = null): Uint8Array | Packer | null {
    if (packerOrIo != null && packerOrIo !== false) {
      if (rbObjIsKindOf(packerOrIo, MessagePack.Packer)) {
        return rbFSend(this, "toMsgpackWithPacker", packerOrIo) as Packer;
      } else {
        return MessagePack.pack(this, packerOrIo);
      }
    } else {
      return MessagePack.pack(this);
    }
  },
};

include(rbCNilClass, CoreExt);
rbModDefineMethod(rbCNilClass, "toMsgpackWithPacker", function (this: null, packer: Packer) {
  packer.writeNil();
  return packer;
});

include(rbCTrueClass, CoreExt);
rbModDefineMethod(rbCTrueClass, "toMsgpackWithPacker", function (this: true, packer: Packer) {
  packer.writeTrue();
  return packer;
});

include(rbCFalseClass, CoreExt);
rbModDefineMethod(rbCFalseClass, "toMsgpackWithPacker", function (this: false, packer: Packer) {
  packer.writeFalse();
  return packer;
});

include(rbCFloat, CoreExt);
rbModDefineMethod(
  rbCFloat,
  "toMsgpackWithPacker",
  function (this: number | { valueOf(): number }, packer: Packer) {
    packer.writeFloat(this);
    return packer;
  },
);

include(rbCString, CoreExt);
rbModDefineMethod(
  rbCString,
  "toMsgpackWithPacker",
  function (this: string | Uint8Array, packer: Packer) {
    packer.writeString(this);
    return packer;
  },
);

include(rbCArray, CoreExt);
rbModDefineMethod(rbCArray, "toMsgpackWithPacker", function (this: unknown[], packer: Packer) {
  packer.writeArray(this);
  return packer;
});

include(RubyHash, CoreExt);
rbModDefineMethod(RubyHash, "toMsgpackWithPacker", function (this: object, packer: Packer) {
  packer.writeHash(this);
  return packer;
});

include(rbCSymbol, CoreExt);
rbModDefineMethod(rbCSymbol, "toMsgpackWithPacker", function (this: string, packer: Packer) {
  packer.writeSymbol(this);
  return packer;
});

include(rbCInteger, CoreExt);
rbModDefineMethod(
  rbCInteger,
  "toMsgpackWithPacker",
  function (this: number | bigint, packer: Packer) {
    packer.writeInt(this);
    return packer;
  },
);

rbModConstSet(MessagePack, "CoreExt", CoreExt);
