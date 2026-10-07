import { rbModConstSet, rbObjIsKindOf } from "@blazetrails/ruby-compat";
import { MessagePack } from "./namespaces.js";
import type { Packer } from "./packer.js";

function toMsgpack<T>(
  this: { toMsgpackWithPacker(self: T, packer: Packer): Packer },
  self: T,
  packerOrIo: unknown = null,
): Uint8Array | Packer {
  if (packerOrIo != null && packerOrIo !== false) {
    if (rbObjIsKindOf(packerOrIo, MessagePack.Packer)) {
      return this.toMsgpackWithPacker(self, packerOrIo as Packer);
    } else {
      return MessagePack.pack(self, packerOrIo);
    }
  } else {
    return MessagePack.pack(self);
  }
}

export const CoreExt = { name: "MessagePack::CoreExt", toMsgpack };

export class NilClass {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(_self: null | undefined, packer: Packer): Packer {
    packer.writeNil();
    return packer;
  }
}

export class TrueClass {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(_self: true, packer: Packer): Packer {
    packer.writeTrue();
    return packer;
  }
}

export class FalseClass {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(_self: false, packer: Packer): Packer {
    packer.writeFalse();
    return packer;
  }
}

export class Float {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(self: number | { valueOf(): number }, packer: Packer): Packer {
    packer.writeFloat(self);
    return packer;
  }
}

export class String {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(self: string | Uint8Array, packer: Packer): Packer {
    packer.writeString(self);
    return packer;
  }
}

export class Array {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(self: unknown[], packer: Packer): Packer {
    packer.writeArray(self);
    return packer;
  }
}

export class Hash {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(self: object, packer: Packer): Packer {
    packer.writeHash(self);
    return packer;
  }
}

export class Symbol {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(self: string, packer: Packer): Packer {
    packer.writeSymbol(self);
    return packer;
  }
}

export class Integer {
  static toMsgpack = toMsgpack;

  /** @internal */
  static toMsgpackWithPacker(self: number | bigint, packer: Packer): Packer {
    packer.writeInt(self);
    return packer;
  }
}

rbModConstSet(MessagePack, "CoreExt", CoreExt);
