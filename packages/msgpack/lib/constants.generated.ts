import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./bigint.js";
import * as m1 from "./buffer.js";
import * as m2 from "./core-ext.js";
import * as m3 from "./extension-value.js";
import * as m4 from "./factory.js";
import * as m5 from "./packer.js";
import * as m6 from "./time.js";
import * as m7 from "./timestamp.js";
import * as m8 from "./unpacker.js";

defineConstants([
  [() => m0.Bigint, "MessagePack::Bigint"],
  [() => m1.Buffer, "MessagePack::Buffer"],
  [() => m2.CoreExt, "MessagePack::CoreExt"],
  [() => m3.ExtensionValue, "MessagePack::ExtensionValue"],
  [() => m4.Factory, "MessagePack::Factory"],
  [() => m4.Pool, "MessagePack::Factory::Pool"],
  [() => m4.MemberPool, "MessagePack::Factory::Pool::MemberPool"],
  [() => m8.MalformedFormatError, "MessagePack::MalformedFormatError"],
  [() => m5.Packer, "MessagePack::Packer"],
  [() => m8.StackError, "MessagePack::StackError"],
  [() => m6.Time, "MessagePack::Time"],
  [() => m7.Timestamp, "MessagePack::Timestamp"],
  [() => m8.TypeError, "MessagePack::TypeError"],
  [() => m8.UnexpectedTypeError, "MessagePack::UnexpectedTypeError"],
  [() => m8.UnknownExtTypeError, "MessagePack::UnknownExtTypeError"],
  [() => m8.Unpacker, "MessagePack::Unpacker"],
  [() => m8.UnpackError, "MessagePack::UnpackError"],
]);
