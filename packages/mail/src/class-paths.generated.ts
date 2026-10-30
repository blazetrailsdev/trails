import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./configuration.js";
import * as m1 from "./encodings.js";
import * as m2 from "./encodings/7bit.js";
import * as m3 from "./encodings/8bit.js";
import * as m4 from "./encodings/base64.js";
import * as m5 from "./encodings/binary.js";
import * as m6 from "./encodings/identity.js";
import * as m7 from "./encodings/quoted-printable.js";
import * as m8 from "./encodings/transfer-encoding.js";
import * as m9 from "./encodings/unix-to-unix.js";
import * as m10 from "./field.js";
import * as m11 from "./multibyte.js";
import * as m12 from "./multibyte/chars.js";
import * as m13 from "./multibyte/unicode.js";
import * as m14 from "./parser-tools.js";
import * as m15 from "./parsers/address-lists-parser.js";
import * as m16 from "./parsers/content-disposition-parser.js";
import * as m17 from "./parsers/content-location-parser.js";
import * as m18 from "./parsers/content-transfer-encoding-parser.js";
import * as m19 from "./parsers/content-type-parser.js";
import * as m20 from "./parsers/date-time-parser.js";
import * as m21 from "./parsers/envelope-from-parser.js";
import * as m22 from "./parsers/message-ids-parser.js";
import * as m23 from "./parsers/mime-version-parser.js";
import * as m24 from "./parsers/phrase-lists-parser.js";
import * as m25 from "./parsers/received-parser.js";
import * as m26 from "./utilities.js";

registerClassPaths([
  [() => m0.Configuration, "Mail::Configuration"],
  [() => m1.Encodings, "Mail::Encodings"],
  [() => m4.Base64, "Mail::Encodings::Base64"],
  [() => m5.Binary, "Mail::Encodings::Binary"],
  [() => m3.EightBit, "Mail::Encodings::EightBit"],
  [() => m6.Identity, "Mail::Encodings::Identity"],
  [() => m7.QuotedPrintable, "Mail::Encodings::QuotedPrintable"],
  [() => m2.SevenBit, "Mail::Encodings::SevenBit"],
  [() => m8.TransferEncoding, "Mail::Encodings::TransferEncoding"],
  [() => m9.UnixToUnix, "Mail::Encodings::UnixToUnix"],
  [() => m10.Field, "Mail::Field"],
  [() => m10.Field.FieldError, "Mail::Field::FieldError"],
  [() => m10.Field.IncompleteParseError, "Mail::Field::IncompleteParseError"],
  [() => m10.Field.NilParseError, "Mail::Field::NilParseError"],
  [() => m10.Field.ParseError, "Mail::Field::ParseError"],
  [() => m10.Field.SyntaxError, "Mail::Field::SyntaxError"],
  [() => m11.Multibyte, "Mail::Multibyte"],
  [() => m12.Chars, "Mail::Multibyte::Chars"],
  [() => m11.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m13.Unicode, "Mail::Multibyte::Unicode"],
  [() => m15.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m16.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m17.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m18.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m19.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m20.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m21.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m22.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m23.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m24.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [() => m25.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m14.ParserTools, "Mail::ParserTools"],
  [() => m1.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m26.Utilities, "Mail::Utilities"],
]);
