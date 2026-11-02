import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./attachments-list.js";
import * as m1 from "./body.js";
import * as m2 from "./configuration.js";
import * as m3 from "./elements/address-list.js";
import * as m4 from "./elements/address.js";
import * as m5 from "./elements/content-disposition-element.js";
import * as m6 from "./elements/content-location-element.js";
import * as m7 from "./elements/content-transfer-encoding-element.js";
import * as m8 from "./elements/content-type-element.js";
import * as m9 from "./elements/date-time-element.js";
import * as m10 from "./elements/envelope-from-element.js";
import * as m11 from "./elements/message-ids-element.js";
import * as m12 from "./elements/mime-version-element.js";
import * as m13 from "./elements/phrase-list.js";
import * as m14 from "./elements/received-element.js";
import * as m15 from "./encodings.js";
import * as m16 from "./encodings/7bit.js";
import * as m17 from "./encodings/8bit.js";
import * as m18 from "./encodings/base64.js";
import * as m19 from "./encodings/binary.js";
import * as m20 from "./encodings/identity.js";
import * as m21 from "./encodings/quoted-printable.js";
import * as m22 from "./encodings/transfer-encoding.js";
import * as m23 from "./encodings/unix-to-unix.js";
import * as m24 from "./field-list.js";
import * as m25 from "./field.js";
import * as m26 from "./fields/bcc-field.js";
import * as m27 from "./fields/cc-field.js";
import * as m28 from "./fields/comments-field.js";
import * as m29 from "./fields/common-address-field.js";
import * as m30 from "./fields/common-date-field.js";
import * as m31 from "./fields/common-field.js";
import * as m32 from "./fields/common-message-id-field.js";
import * as m33 from "./fields/content-description-field.js";
import * as m34 from "./fields/content-location-field.js";
import * as m35 from "./fields/content-transfer-encoding-field.js";
import * as m36 from "./fields/date-field.js";
import * as m37 from "./fields/from-field.js";
import * as m38 from "./fields/in-reply-to-field.js";
import * as m39 from "./fields/keywords-field.js";
import * as m40 from "./fields/message-id-field.js";
import * as m41 from "./fields/mime-version-field.js";
import * as m42 from "./fields/named-structured-field.js";
import * as m43 from "./fields/named-unstructured-field.js";
import * as m44 from "./fields/optional-field.js";
import * as m45 from "./fields/received-field.js";
import * as m46 from "./fields/references-field.js";
import * as m47 from "./fields/reply-to-field.js";
import * as m48 from "./fields/resent-bcc-field.js";
import * as m49 from "./fields/resent-cc-field.js";
import * as m50 from "./fields/resent-date-field.js";
import * as m51 from "./fields/resent-from-field.js";
import * as m52 from "./fields/resent-message-id-field.js";
import * as m53 from "./fields/resent-sender-field.js";
import * as m54 from "./fields/resent-to-field.js";
import * as m55 from "./fields/return-path-field.js";
import * as m56 from "./fields/sender-field.js";
import * as m57 from "./fields/structured-field.js";
import * as m58 from "./fields/subject-field.js";
import * as m59 from "./fields/to-field.js";
import * as m60 from "./fields/unstructured-field.js";
import * as m61 from "./header.js";
import * as m62 from "./indifferent-hash.js";
import * as m63 from "./multibyte.js";
import * as m64 from "./multibyte/chars.js";
import * as m65 from "./multibyte/unicode.js";
import * as m66 from "./parser-tools.js";
import * as m67 from "./parsers/address-lists-parser.js";
import * as m68 from "./parsers/content-disposition-parser.js";
import * as m69 from "./parsers/content-location-parser.js";
import * as m70 from "./parsers/content-transfer-encoding-parser.js";
import * as m71 from "./parsers/content-type-parser.js";
import * as m72 from "./parsers/date-time-parser.js";
import * as m73 from "./parsers/envelope-from-parser.js";
import * as m74 from "./parsers/message-ids-parser.js";
import * as m75 from "./parsers/mime-version-parser.js";
import * as m76 from "./parsers/phrase-lists-parser.js";
import * as m77 from "./parsers/received-parser.js";
import * as m78 from "./parts-list.js";
import * as m79 from "./utilities.js";

registerClassPaths([
  [() => m4.Address, "Mail::Address"],
  [() => m29.AddressContainer, "Mail::AddressContainer"],
  [() => m3.AddressList, "Mail::AddressList"],
  [() => m0.AttachmentsList, "Mail::AttachmentsList"],
  [() => m26.BccField, "Mail::BccField"],
  [() => m1.Body, "Mail::Body"],
  [() => m27.CcField, "Mail::CcField"],
  [() => m28.CommentsField, "Mail::CommentsField"],
  [() => m29.CommonAddressField, "Mail::CommonAddressField"],
  [() => m30.CommonDateField, "Mail::CommonDateField"],
  [() => m31.CommonField, "Mail::CommonField"],
  [() => m32.CommonMessageIdField, "Mail::CommonMessageIdField"],
  [() => m2.Configuration, "Mail::Configuration"],
  [() => m33.ContentDescriptionField, "Mail::ContentDescriptionField"],
  [() => m5.ContentDispositionElement, "Mail::ContentDispositionElement"],
  [() => m6.ContentLocationElement, "Mail::ContentLocationElement"],
  [() => m34.ContentLocationField, "Mail::ContentLocationField"],
  [() => m7.ContentTransferEncodingElement, "Mail::ContentTransferEncodingElement"],
  [() => m35.ContentTransferEncodingField, "Mail::ContentTransferEncodingField"],
  [() => m8.ContentTypeElement, "Mail::ContentTypeElement"],
  [() => m36.DateField, "Mail::DateField"],
  [() => m9.DateTimeElement, "Mail::DateTimeElement"],
  [() => m15.Encodings, "Mail::Encodings"],
  [() => m18.Base64, "Mail::Encodings::Base64"],
  [() => m19.Binary, "Mail::Encodings::Binary"],
  [() => m17.EightBit, "Mail::Encodings::EightBit"],
  [() => m20.Identity, "Mail::Encodings::Identity"],
  [() => m21.QuotedPrintable, "Mail::Encodings::QuotedPrintable"],
  [() => m16.SevenBit, "Mail::Encodings::SevenBit"],
  [() => m22.TransferEncoding, "Mail::Encodings::TransferEncoding"],
  [() => m23.UnixToUnix, "Mail::Encodings::UnixToUnix"],
  [() => m10.EnvelopeFromElement, "Mail::EnvelopeFromElement"],
  [() => m25.Field, "Mail::Field"],
  [() => m25.Field.FieldError, "Mail::Field::FieldError"],
  [() => m25.Field.IncompleteParseError, "Mail::Field::IncompleteParseError"],
  [() => m25.Field.NilParseError, "Mail::Field::NilParseError"],
  [() => m25.Field.ParseError, "Mail::Field::ParseError"],
  [() => m25.Field.SyntaxError, "Mail::Field::SyntaxError"],
  [() => m24.FieldList, "Mail::FieldList"],
  [() => m37.FromField, "Mail::FromField"],
  [() => m61.Header, "Mail::Header"],
  [() => m62.IndifferentHash, "Mail::IndifferentHash"],
  [() => m38.InReplyToField, "Mail::InReplyToField"],
  [() => m39.KeywordsField, "Mail::KeywordsField"],
  [() => m40.MessageIdField, "Mail::MessageIdField"],
  [() => m11.MessageIdsElement, "Mail::MessageIdsElement"],
  [() => m12.MimeVersionElement, "Mail::MimeVersionElement"],
  [() => m41.MimeVersionField, "Mail::MimeVersionField"],
  [() => m63.Multibyte, "Mail::Multibyte"],
  [() => m64.Chars, "Mail::Multibyte::Chars"],
  [() => m63.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m65.Unicode, "Mail::Multibyte::Unicode"],
  [() => m42.NamedStructuredField, "Mail::NamedStructuredField"],
  [() => m43.NamedUnstructuredField, "Mail::NamedUnstructuredField"],
  [() => m44.OptionalField, "Mail::OptionalField"],
  [() => m67.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m68.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m69.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m70.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m71.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m72.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m73.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m74.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m75.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m76.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [() => m77.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m66.ParserTools, "Mail::ParserTools"],
  [() => m78.PartsList, "Mail::PartsList"],
  [() => m13.PhraseList, "Mail::PhraseList"],
  [() => m14.ReceivedElement, "Mail::ReceivedElement"],
  [() => m45.ReceivedField, "Mail::ReceivedField"],
  [() => m46.ReferencesField, "Mail::ReferencesField"],
  [() => m47.ReplyToField, "Mail::ReplyToField"],
  [() => m48.ResentBccField, "Mail::ResentBccField"],
  [() => m49.ResentCcField, "Mail::ResentCcField"],
  [() => m50.ResentDateField, "Mail::ResentDateField"],
  [() => m51.ResentFromField, "Mail::ResentFromField"],
  [() => m52.ResentMessageIdField, "Mail::ResentMessageIdField"],
  [() => m53.ResentSenderField, "Mail::ResentSenderField"],
  [() => m54.ResentToField, "Mail::ResentToField"],
  [() => m55.ReturnPathField, "Mail::ReturnPathField"],
  [() => m56.SenderField, "Mail::SenderField"],
  [() => m57.StructuredField, "Mail::StructuredField"],
  [() => m58.SubjectField, "Mail::SubjectField"],
  [() => m59.ToField, "Mail::ToField"],
  [() => m15.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m60.UnstructuredField, "Mail::UnstructuredField"],
  [() => m79.Utilities, "Mail::Utilities"],
]);
