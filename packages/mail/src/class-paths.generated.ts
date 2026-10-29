import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./encodings.js";
import * as m1 from "./encodings/7bit.js";
import * as m2 from "./encodings/8bit.js";
import * as m3 from "./encodings/base64.js";
import * as m4 from "./encodings/binary.js";
import * as m5 from "./encodings/identity.js";
import * as m6 from "./encodings/quoted-printable.js";
import * as m7 from "./encodings/transfer-encoding.js";
import * as m8 from "./encodings/unix-to-unix.js";
import * as m9 from "./utilities.js";

registerClassPaths([
  [() => m0.Encodings, "Mail::Encodings"],
  [() => m3.Base64, "Mail::Encodings::Base64"],
  [() => m4.Binary, "Mail::Encodings::Binary"],
  [() => m2.EightBit, "Mail::Encodings::EightBit"],
  [() => m5.Identity, "Mail::Encodings::Identity"],
  [() => m6.QuotedPrintable, "Mail::Encodings::QuotedPrintable"],
  [() => m1.SevenBit, "Mail::Encodings::SevenBit"],
  [() => m7.TransferEncoding, "Mail::Encodings::TransferEncoding"],
  [() => m8.UnixToUnix, "Mail::Encodings::UnixToUnix"],
  [() => m0.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m9.Utilities, "Mail::Utilities"],
]);
