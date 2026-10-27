import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./bigint.js";
import * as m1 from "./buffer.js";
import * as m2 from "./core-ext.js";
import * as m3 from "./factory.js";
import * as m4 from "./packer.js";
import * as m5 from "./time.js";
import * as m6 from "./timestamp.js";
import * as m7 from "./unpacker.js";

registerClassPaths([
  [() => m0.Bigint, "MessagePack::Bigint"],
  [() => m1.Buffer, "MessagePack::Buffer"],
  [() => m2.CoreExt, "MessagePack::CoreExt"],
  [() => m3.Factory, "MessagePack::Factory"],
  [() => m3.Pool, "MessagePack::Factory::Pool"],
  [() => m3.MemberPool, "MessagePack::Factory::Pool::MemberPool"],
  [() => m4.Packer, "MessagePack::Packer"],
  [() => m5.Time, "MessagePack::Time"],
  [() => m6.Timestamp, "MessagePack::Timestamp"],
  [() => m7.Unpacker, "MessagePack::Unpacker"],
]);
