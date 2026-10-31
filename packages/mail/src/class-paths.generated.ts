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
import * as m23 from "./fields/bcc-field.js";
import * as m24 from "./fields/cc-field.js";
import * as m25 from "./fields/common-address-field.js";
import * as m26 from "./fields/common-date-field.js";
import * as m27 from "./fields/common-field.js";
import * as m28 from "./fields/common-message-id-field.js";
import * as m29 from "./fields/date-field.js";
import * as m30 from "./fields/from-field.js";
import * as m31 from "./fields/message-id-field.js";
import * as m32 from "./fields/named-structured-field.js";
import * as m33 from "./fields/named-unstructured-field.js";
import * as m34 from "./fields/optional-field.js";
import * as m35 from "./fields/reply-to-field.js";
import * as m36 from "./fields/resent-bcc-field.js";
import * as m37 from "./fields/resent-cc-field.js";
import * as m38 from "./fields/resent-date-field.js";
import * as m39 from "./fields/resent-from-field.js";
import * as m40 from "./fields/resent-message-id-field.js";
import * as m41 from "./fields/resent-sender-field.js";
import * as m42 from "./fields/resent-to-field.js";
import * as m43 from "./fields/return-path-field.js";
import * as m44 from "./fields/sender-field.js";
import * as m45 from "./fields/structured-field.js";
import * as m46 from "./fields/subject-field.js";
import * as m47 from "./fields/to-field.js";
import * as m48 from "./fields/unstructured-field.js";
import * as m49 from "./multibyte.js";
import * as m50 from "./multibyte/chars.js";
import * as m51 from "./multibyte/unicode.js";
import * as m52 from "./parser-tools.js";
import * as m53 from "./parsers/address-lists-parser.js";
import * as m54 from "./parsers/content-disposition-parser.js";
import * as m55 from "./parsers/content-location-parser.js";
import * as m56 from "./parsers/content-transfer-encoding-parser.js";
import * as m57 from "./parsers/content-type-parser.js";
import * as m58 from "./parsers/date-time-parser.js";
import * as m59 from "./parsers/envelope-from-parser.js";
import * as m60 from "./parsers/message-ids-parser.js";
import * as m61 from "./parsers/mime-version-parser.js";
import * as m62 from "./parsers/phrase-lists-parser.js";
import * as m63 from "./parsers/received-parser.js";
import * as m64 from "./utilities.js";

registerClassPaths([
  [() => m2.Address, "Mail::Address"],
  [() => m25.AddressContainer, "Mail::AddressContainer"],
  [() => m1.AddressList, "Mail::AddressList"],
  [() => m23.BccField, "Mail::BccField"],
  [() => m24.CcField, "Mail::CcField"],
  [() => m25.CommonAddressField, "Mail::CommonAddressField"],
  [() => m26.CommonDateField, "Mail::CommonDateField"],
  [() => m27.CommonField, "Mail::CommonField"],
  [() => m28.CommonMessageIdField, "Mail::CommonMessageIdField"],
  [() => m0.Configuration, "Mail::Configuration"],
  [() => m3.ContentDispositionElement, "Mail::ContentDispositionElement"],
  [() => m4.ContentLocationElement, "Mail::ContentLocationElement"],
  [() => m5.ContentTransferEncodingElement, "Mail::ContentTransferEncodingElement"],
  [() => m6.ContentTypeElement, "Mail::ContentTypeElement"],
  [() => m29.DateField, "Mail::DateField"],
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
  [() => m30.FromField, "Mail::FromField"],
  [() => m31.MessageIdField, "Mail::MessageIdField"],
  [() => m9.MessageIdsElement, "Mail::MessageIdsElement"],
  [() => m10.MimeVersionElement, "Mail::MimeVersionElement"],
  [() => m49.Multibyte, "Mail::Multibyte"],
  [() => m50.Chars, "Mail::Multibyte::Chars"],
  [() => m49.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m51.Unicode, "Mail::Multibyte::Unicode"],
  [() => m32.NamedStructuredField, "Mail::NamedStructuredField"],
  [() => m33.NamedUnstructuredField, "Mail::NamedUnstructuredField"],
  [() => m34.OptionalField, "Mail::OptionalField"],
  [() => m53.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m54.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m55.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m56.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m57.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m58.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m59.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m60.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m61.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m62.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [() => m63.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m52.ParserTools, "Mail::ParserTools"],
  [() => m11.PhraseList, "Mail::PhraseList"],
  [() => m12.ReceivedElement, "Mail::ReceivedElement"],
  [() => m35.ReplyToField, "Mail::ReplyToField"],
  [() => m36.ResentBccField, "Mail::ResentBccField"],
  [() => m37.ResentCcField, "Mail::ResentCcField"],
  [() => m38.ResentDateField, "Mail::ResentDateField"],
  [() => m39.ResentFromField, "Mail::ResentFromField"],
  [() => m40.ResentMessageIdField, "Mail::ResentMessageIdField"],
  [() => m41.ResentSenderField, "Mail::ResentSenderField"],
  [() => m42.ResentToField, "Mail::ResentToField"],
  [() => m43.ReturnPathField, "Mail::ReturnPathField"],
  [() => m44.SenderField, "Mail::SenderField"],
  [() => m45.StructuredField, "Mail::StructuredField"],
  [() => m46.SubjectField, "Mail::SubjectField"],
  [() => m47.ToField, "Mail::ToField"],
  [() => m13.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m48.UnstructuredField, "Mail::UnstructuredField"],
  [() => m64.Utilities, "Mail::Utilities"],
]);
