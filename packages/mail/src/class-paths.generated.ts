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
import * as m22 from "./field-list.js";
import * as m23 from "./field.js";
import * as m24 from "./fields/bcc-field.js";
import * as m25 from "./fields/cc-field.js";
import * as m26 from "./fields/comments-field.js";
import * as m27 from "./fields/common-address-field.js";
import * as m28 from "./fields/common-date-field.js";
import * as m29 from "./fields/common-field.js";
import * as m30 from "./fields/common-message-id-field.js";
import * as m31 from "./fields/content-description-field.js";
import * as m32 from "./fields/content-location-field.js";
import * as m33 from "./fields/content-transfer-encoding-field.js";
import * as m34 from "./fields/date-field.js";
import * as m35 from "./fields/from-field.js";
import * as m36 from "./fields/in-reply-to-field.js";
import * as m37 from "./fields/keywords-field.js";
import * as m38 from "./fields/message-id-field.js";
import * as m39 from "./fields/mime-version-field.js";
import * as m40 from "./fields/named-structured-field.js";
import * as m41 from "./fields/named-unstructured-field.js";
import * as m42 from "./fields/optional-field.js";
import * as m43 from "./fields/received-field.js";
import * as m44 from "./fields/references-field.js";
import * as m45 from "./fields/reply-to-field.js";
import * as m46 from "./fields/resent-bcc-field.js";
import * as m47 from "./fields/resent-cc-field.js";
import * as m48 from "./fields/resent-date-field.js";
import * as m49 from "./fields/resent-from-field.js";
import * as m50 from "./fields/resent-message-id-field.js";
import * as m51 from "./fields/resent-sender-field.js";
import * as m52 from "./fields/resent-to-field.js";
import * as m53 from "./fields/return-path-field.js";
import * as m54 from "./fields/sender-field.js";
import * as m55 from "./fields/structured-field.js";
import * as m56 from "./fields/subject-field.js";
import * as m57 from "./fields/to-field.js";
import * as m58 from "./fields/unstructured-field.js";
import * as m59 from "./header.js";
import * as m60 from "./multibyte.js";
import * as m61 from "./multibyte/chars.js";
import * as m62 from "./multibyte/unicode.js";
import * as m63 from "./parser-tools.js";
import * as m64 from "./parsers/address-lists-parser.js";
import * as m65 from "./parsers/content-disposition-parser.js";
import * as m66 from "./parsers/content-location-parser.js";
import * as m67 from "./parsers/content-transfer-encoding-parser.js";
import * as m68 from "./parsers/content-type-parser.js";
import * as m69 from "./parsers/date-time-parser.js";
import * as m70 from "./parsers/envelope-from-parser.js";
import * as m71 from "./parsers/message-ids-parser.js";
import * as m72 from "./parsers/mime-version-parser.js";
import * as m73 from "./parsers/phrase-lists-parser.js";
import * as m74 from "./parsers/received-parser.js";
import * as m75 from "./utilities.js";

registerClassPaths([
  [() => m2.Address, "Mail::Address"],
  [() => m27.AddressContainer, "Mail::AddressContainer"],
  [() => m1.AddressList, "Mail::AddressList"],
  [() => m24.BccField, "Mail::BccField"],
  [() => m25.CcField, "Mail::CcField"],
  [() => m26.CommentsField, "Mail::CommentsField"],
  [() => m27.CommonAddressField, "Mail::CommonAddressField"],
  [() => m28.CommonDateField, "Mail::CommonDateField"],
  [() => m29.CommonField, "Mail::CommonField"],
  [() => m30.CommonMessageIdField, "Mail::CommonMessageIdField"],
  [() => m0.Configuration, "Mail::Configuration"],
  [() => m31.ContentDescriptionField, "Mail::ContentDescriptionField"],
  [() => m3.ContentDispositionElement, "Mail::ContentDispositionElement"],
  [() => m4.ContentLocationElement, "Mail::ContentLocationElement"],
  [() => m32.ContentLocationField, "Mail::ContentLocationField"],
  [() => m5.ContentTransferEncodingElement, "Mail::ContentTransferEncodingElement"],
  [() => m33.ContentTransferEncodingField, "Mail::ContentTransferEncodingField"],
  [() => m6.ContentTypeElement, "Mail::ContentTypeElement"],
  [() => m34.DateField, "Mail::DateField"],
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
  [() => m23.Field, "Mail::Field"],
  [() => m23.Field.FieldError, "Mail::Field::FieldError"],
  [() => m23.Field.IncompleteParseError, "Mail::Field::IncompleteParseError"],
  [() => m23.Field.NilParseError, "Mail::Field::NilParseError"],
  [() => m23.Field.ParseError, "Mail::Field::ParseError"],
  [() => m23.Field.SyntaxError, "Mail::Field::SyntaxError"],
  [() => m22.FieldList, "Mail::FieldList"],
  [() => m35.FromField, "Mail::FromField"],
  [() => m59.Header, "Mail::Header"],
  [() => m36.InReplyToField, "Mail::InReplyToField"],
  [() => m37.KeywordsField, "Mail::KeywordsField"],
  [() => m38.MessageIdField, "Mail::MessageIdField"],
  [() => m9.MessageIdsElement, "Mail::MessageIdsElement"],
  [() => m10.MimeVersionElement, "Mail::MimeVersionElement"],
  [() => m39.MimeVersionField, "Mail::MimeVersionField"],
  [() => m60.Multibyte, "Mail::Multibyte"],
  [() => m61.Chars, "Mail::Multibyte::Chars"],
  [() => m60.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m62.Unicode, "Mail::Multibyte::Unicode"],
  [() => m40.NamedStructuredField, "Mail::NamedStructuredField"],
  [() => m41.NamedUnstructuredField, "Mail::NamedUnstructuredField"],
  [() => m42.OptionalField, "Mail::OptionalField"],
  [() => m64.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m65.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m66.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m67.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m68.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m69.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m70.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m71.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m72.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m73.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [() => m74.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m63.ParserTools, "Mail::ParserTools"],
  [() => m11.PhraseList, "Mail::PhraseList"],
  [() => m12.ReceivedElement, "Mail::ReceivedElement"],
  [() => m43.ReceivedField, "Mail::ReceivedField"],
  [() => m44.ReferencesField, "Mail::ReferencesField"],
  [() => m45.ReplyToField, "Mail::ReplyToField"],
  [() => m46.ResentBccField, "Mail::ResentBccField"],
  [() => m47.ResentCcField, "Mail::ResentCcField"],
  [() => m48.ResentDateField, "Mail::ResentDateField"],
  [() => m49.ResentFromField, "Mail::ResentFromField"],
  [() => m50.ResentMessageIdField, "Mail::ResentMessageIdField"],
  [() => m51.ResentSenderField, "Mail::ResentSenderField"],
  [() => m52.ResentToField, "Mail::ResentToField"],
  [() => m53.ReturnPathField, "Mail::ReturnPathField"],
  [() => m54.SenderField, "Mail::SenderField"],
  [() => m55.StructuredField, "Mail::StructuredField"],
  [() => m56.SubjectField, "Mail::SubjectField"],
  [() => m57.ToField, "Mail::ToField"],
  [() => m13.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m58.UnstructuredField, "Mail::UnstructuredField"],
  [() => m75.Utilities, "Mail::Utilities"],
]);
