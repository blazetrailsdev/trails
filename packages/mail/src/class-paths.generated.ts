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
import * as m9 from "./field.js";
import * as m10 from "./multibyte.js";
import * as m11 from "./multibyte/chars.js";
import * as m12 from "./multibyte/unicode.js";
import * as m13 from "./parser-tools.js";
import * as m14 from "./parsers/address-lists-parser.js";
import * as m15 from "./parsers/content-disposition-parser.js";
import * as m16 from "./parsers/content-location-parser.js";
import * as m17 from "./parsers/content-transfer-encoding-parser.js";
import * as m18 from "./parsers/content-type-parser.js";
import * as m19 from "./parsers/date-time-parser.js";
import * as m20 from "./parsers/envelope-from-parser.js";
import * as m21 from "./parsers/message-ids-parser.js";
import * as m22 from "./parsers/mime-version-parser.js";
import * as m23 from "./parsers/phrase-lists-parser.js";
import * as m24 from "./parsers/received-parser.js";
import * as m25 from "./utilities.js";

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
  [() => m9.Field, "Mail::Field"],
  [() => m9.Field.FieldError, "Mail::Field::FieldError"],
  [() => m9.Field.IncompleteParseError, "Mail::Field::IncompleteParseError"],
  [() => m9.Field.NilParseError, "Mail::Field::NilParseError"],
  [() => m9.Field.ParseError, "Mail::Field::ParseError"],
  [() => m9.Field.SyntaxError, "Mail::Field::SyntaxError"],
  [() => m10.Multibyte, "Mail::Multibyte"],
  [() => m11.Chars, "Mail::Multibyte::Chars"],
  [() => m10.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m12.Unicode, "Mail::Multibyte::Unicode"],
  [() => m14.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m15.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m16.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m17.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m18.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m19.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m20.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m21.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m22.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m23.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [() => m24.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m13.ParserTools, "Mail::ParserTools"],
  [() => m0.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m25.Utilities, "Mail::Utilities"],
]);
