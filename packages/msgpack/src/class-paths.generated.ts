import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./buffer.js";
import * as m1 from "./factory.js";
import * as m2 from "./packer.js";
import * as m3 from "./timestamp.js";
import * as m4 from "./unpacker.js";

registerClassPaths([
  [() => m0.Buffer, "MessagePack::Buffer"],
  [() => m1.Factory, "MessagePack::Factory"],
  [() => m1.Pool, "MessagePack::Factory::Pool"],
  [() => m1.MemberPool, "MessagePack::Factory::Pool::MemberPool"],
  [() => m2.Packer, "MessagePack::Packer"],
  [() => m3.Timestamp, "MessagePack::Timestamp"],
  [() => m4.Unpacker, "MessagePack::Unpacker"],
]);
