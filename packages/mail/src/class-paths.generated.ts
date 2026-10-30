import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./configuration.js";
import * as m1 from "./elements/address-list.js";
import * as m2 from "./elements/address.js";
import * as m3 from "./elements/content-disposition-element.js";
import * as m4 from "./elements/content-location-element.js";
import * as m5 from "./elements/content-transfer-encoding-element.js";
import * as m6 from "./elements/content-type-element.js";
import * as m7 from "./elements/date-time-element.js";
import * as m8 from "./elements/envelope-from-element.js";
import * as m9 from "./elements/message-ids-element.js";
import * as m10 from "./elements/mime-version-element.js";
import * as m11 from "./elements/phrase-list.js";
import * as m12 from "./elements/received-element.js";
import * as m13 from "./encodings.js";
import * as m14 from "./encodings/7bit.js";
import * as m15 from "./encodings/8bit.js";
import * as m16 from "./encodings/base64.js";
import * as m17 from "./encodings/binary.js";
import * as m18 from "./encodings/identity.js";
import * as m19 from "./encodings/quoted-printable.js";
import * as m20 from "./encodings/transfer-encoding.js";
import * as m21 from "./encodings/unix-to-unix.js";
import * as m22 from "./field.js";
import * as m23 from "./multibyte.js";
import * as m24 from "./multibyte/chars.js";
import * as m25 from "./multibyte/unicode.js";
import * as m26 from "./parser-tools.js";
import * as m27 from "./parsers/address-lists-parser.js";
import * as m28 from "./parsers/content-disposition-parser.js";
import * as m29 from "./parsers/content-location-parser.js";
import * as m30 from "./parsers/content-transfer-encoding-parser.js";
import * as m31 from "./parsers/content-type-parser.js";
import * as m32 from "./parsers/date-time-parser.js";
import * as m33 from "./parsers/envelope-from-parser.js";
import * as m34 from "./parsers/message-ids-parser.js";
import * as m35 from "./parsers/mime-version-parser.js";
import * as m36 from "./parsers/phrase-lists-parser.js";
import * as m37 from "./parsers/received-parser.js";
import * as m38 from "./utilities.js";

registerClassPaths([
  [() => m2.Address, "Mail::Address"],
  [() => m1.AddressList, "Mail::AddressList"],
  [() => m0.Configuration, "Mail::Configuration"],
  [() => m3.ContentDispositionElement, "Mail::ContentDispositionElement"],
  [() => m4.ContentLocationElement, "Mail::ContentLocationElement"],
  [() => m5.ContentTransferEncodingElement, "Mail::ContentTransferEncodingElement"],
  [() => m6.ContentTypeElement, "Mail::ContentTypeElement"],
  [() => m7.DateTimeElement, "Mail::DateTimeElement"],
  [() => m13.Encodings, "Mail::Encodings"],
  [() => m16.Base64, "Mail::Encodings::Base64"],
  [() => m17.Binary, "Mail::Encodings::Binary"],
  [() => m15.EightBit, "Mail::Encodings::EightBit"],
  [() => m18.Identity, "Mail::Encodings::Identity"],
  [() => m19.QuotedPrintable, "Mail::Encodings::QuotedPrintable"],
  [() => m14.SevenBit, "Mail::Encodings::SevenBit"],
  [() => m20.TransferEncoding, "Mail::Encodings::TransferEncoding"],
  [() => m21.UnixToUnix, "Mail::Encodings::UnixToUnix"],
  [() => m8.EnvelopeFromElement, "Mail::EnvelopeFromElement"],
  [() => m22.Field, "Mail::Field"],
  [() => m22.Field.FieldError, "Mail::Field::FieldError"],
  [() => m22.Field.IncompleteParseError, "Mail::Field::IncompleteParseError"],
  [() => m22.Field.NilParseError, "Mail::Field::NilParseError"],
  [() => m22.Field.ParseError, "Mail::Field::ParseError"],
  [() => m22.Field.SyntaxError, "Mail::Field::SyntaxError"],
  [() => m9.MessageIdsElement, "Mail::MessageIdsElement"],
  [() => m10.MimeVersionElement, "Mail::MimeVersionElement"],
  [() => m23.Multibyte, "Mail::Multibyte"],
  [() => m24.Chars, "Mail::Multibyte::Chars"],
  [() => m23.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m25.Unicode, "Mail::Multibyte::Unicode"],
  [() => m27.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m28.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m29.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m30.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m31.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m32.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m33.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m34.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m35.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m36.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [() => m37.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m26.ParserTools, "Mail::ParserTools"],
  [() => m11.PhraseList, "Mail::PhraseList"],
  [() => m12.ReceivedElement, "Mail::ReceivedElement"],
  [() => m13.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m38.Utilities, "Mail::Utilities"],
]);
