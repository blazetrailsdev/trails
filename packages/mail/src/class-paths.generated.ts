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
import * as m25 from "./fields/comments-field.js";
import * as m26 from "./fields/common-address-field.js";
import * as m27 from "./fields/common-date-field.js";
import * as m28 from "./fields/common-field.js";
import * as m29 from "./fields/common-message-id-field.js";
import * as m30 from "./fields/content-description-field.js";
import * as m31 from "./fields/content-location-field.js";
import * as m32 from "./fields/content-transfer-encoding-field.js";
import * as m33 from "./fields/date-field.js";
import * as m34 from "./fields/from-field.js";
import * as m35 from "./fields/in-reply-to-field.js";
import * as m36 from "./fields/keywords-field.js";
import * as m37 from "./fields/message-id-field.js";
import * as m38 from "./fields/mime-version-field.js";
import * as m39 from "./fields/named-structured-field.js";
import * as m40 from "./fields/named-unstructured-field.js";
import * as m41 from "./fields/optional-field.js";
import * as m42 from "./fields/received-field.js";
import * as m43 from "./fields/references-field.js";
import * as m44 from "./fields/reply-to-field.js";
import * as m45 from "./fields/resent-bcc-field.js";
import * as m46 from "./fields/resent-cc-field.js";
import * as m47 from "./fields/resent-date-field.js";
import * as m48 from "./fields/resent-from-field.js";
import * as m49 from "./fields/resent-message-id-field.js";
import * as m50 from "./fields/resent-sender-field.js";
import * as m51 from "./fields/resent-to-field.js";
import * as m52 from "./fields/return-path-field.js";
import * as m53 from "./fields/sender-field.js";
import * as m54 from "./fields/structured-field.js";
import * as m55 from "./fields/subject-field.js";
import * as m56 from "./fields/to-field.js";
import * as m57 from "./fields/unstructured-field.js";
import * as m58 from "./multibyte.js";
import * as m59 from "./multibyte/chars.js";
import * as m60 from "./multibyte/unicode.js";
import * as m61 from "./parser-tools.js";
import * as m62 from "./parsers/address-lists-parser.js";
import * as m63 from "./parsers/content-disposition-parser.js";
import * as m64 from "./parsers/content-location-parser.js";
import * as m65 from "./parsers/content-transfer-encoding-parser.js";
import * as m66 from "./parsers/content-type-parser.js";
import * as m67 from "./parsers/date-time-parser.js";
import * as m68 from "./parsers/envelope-from-parser.js";
import * as m69 from "./parsers/message-ids-parser.js";
import * as m70 from "./parsers/mime-version-parser.js";
import * as m71 from "./parsers/phrase-lists-parser.js";
import * as m72 from "./parsers/received-parser.js";
import * as m73 from "./utilities.js";

registerClassPaths([
  [() => m2.Address, "Mail::Address"],
  [() => m26.AddressContainer, "Mail::AddressContainer"],
  [() => m1.AddressList, "Mail::AddressList"],
  [() => m23.BccField, "Mail::BccField"],
  [() => m24.CcField, "Mail::CcField"],
  [() => m25.CommentsField, "Mail::CommentsField"],
  [() => m26.CommonAddressField, "Mail::CommonAddressField"],
  [() => m27.CommonDateField, "Mail::CommonDateField"],
  [() => m28.CommonField, "Mail::CommonField"],
  [() => m29.CommonMessageIdField, "Mail::CommonMessageIdField"],
  [() => m0.Configuration, "Mail::Configuration"],
  [() => m30.ContentDescriptionField, "Mail::ContentDescriptionField"],
  [() => m3.ContentDispositionElement, "Mail::ContentDispositionElement"],
  [() => m4.ContentLocationElement, "Mail::ContentLocationElement"],
  [() => m31.ContentLocationField, "Mail::ContentLocationField"],
  [() => m5.ContentTransferEncodingElement, "Mail::ContentTransferEncodingElement"],
  [() => m32.ContentTransferEncodingField, "Mail::ContentTransferEncodingField"],
  [() => m6.ContentTypeElement, "Mail::ContentTypeElement"],
  [() => m33.DateField, "Mail::DateField"],
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
  [() => m34.FromField, "Mail::FromField"],
  [() => m35.InReplyToField, "Mail::InReplyToField"],
  [() => m36.KeywordsField, "Mail::KeywordsField"],
  [() => m37.MessageIdField, "Mail::MessageIdField"],
  [() => m9.MessageIdsElement, "Mail::MessageIdsElement"],
  [() => m10.MimeVersionElement, "Mail::MimeVersionElement"],
  [() => m38.MimeVersionField, "Mail::MimeVersionField"],
  [() => m58.Multibyte, "Mail::Multibyte"],
  [() => m59.Chars, "Mail::Multibyte::Chars"],
  [() => m58.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m60.Unicode, "Mail::Multibyte::Unicode"],
  [() => m39.NamedStructuredField, "Mail::NamedStructuredField"],
  [() => m40.NamedUnstructuredField, "Mail::NamedUnstructuredField"],
  [() => m41.OptionalField, "Mail::OptionalField"],
  [() => m62.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m63.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m64.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m65.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m66.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m67.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m68.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m69.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m70.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m71.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [() => m72.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m61.ParserTools, "Mail::ParserTools"],
  [() => m11.PhraseList, "Mail::PhraseList"],
  [() => m12.ReceivedElement, "Mail::ReceivedElement"],
  [() => m42.ReceivedField, "Mail::ReceivedField"],
  [() => m43.ReferencesField, "Mail::ReferencesField"],
  [() => m44.ReplyToField, "Mail::ReplyToField"],
  [() => m45.ResentBccField, "Mail::ResentBccField"],
  [() => m46.ResentCcField, "Mail::ResentCcField"],
  [() => m47.ResentDateField, "Mail::ResentDateField"],
  [() => m48.ResentFromField, "Mail::ResentFromField"],
  [() => m49.ResentMessageIdField, "Mail::ResentMessageIdField"],
  [() => m50.ResentSenderField, "Mail::ResentSenderField"],
  [() => m51.ResentToField, "Mail::ResentToField"],
  [() => m52.ReturnPathField, "Mail::ReturnPathField"],
  [() => m53.SenderField, "Mail::SenderField"],
  [() => m54.StructuredField, "Mail::StructuredField"],
  [() => m55.SubjectField, "Mail::SubjectField"],
  [() => m56.ToField, "Mail::ToField"],
  [() => m13.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m57.UnstructuredField, "Mail::UnstructuredField"],
  [() => m73.Utilities, "Mail::Utilities"],
]);
