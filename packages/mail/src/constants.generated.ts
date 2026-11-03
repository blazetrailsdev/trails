import { defineConstants } from "@blazetrails/ruby-compat";
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
import * as m24 from "./envelope.js";
import * as m25 from "./field-list.js";
import * as m26 from "./field.js";
import * as m27 from "./fields/bcc-field.js";
import * as m28 from "./fields/cc-field.js";
import * as m29 from "./fields/comments-field.js";
import * as m30 from "./fields/common-address-field.js";
import * as m31 from "./fields/common-date-field.js";
import * as m32 from "./fields/common-field.js";
import * as m33 from "./fields/common-message-id-field.js";
import * as m34 from "./fields/content-description-field.js";
import * as m35 from "./fields/content-disposition-field.js";
import * as m36 from "./fields/content-id-field.js";
import * as m37 from "./fields/content-location-field.js";
import * as m38 from "./fields/content-transfer-encoding-field.js";
import * as m39 from "./fields/content-type-field.js";
import * as m40 from "./fields/date-field.js";
import * as m41 from "./fields/from-field.js";
import * as m42 from "./fields/in-reply-to-field.js";
import * as m43 from "./fields/keywords-field.js";
import * as m44 from "./fields/message-id-field.js";
import * as m45 from "./fields/mime-version-field.js";
import * as m46 from "./fields/named-structured-field.js";
import * as m47 from "./fields/named-unstructured-field.js";
import * as m48 from "./fields/optional-field.js";
import * as m49 from "./fields/parameter-hash.js";
import * as m50 from "./fields/received-field.js";
import * as m51 from "./fields/references-field.js";
import * as m52 from "./fields/reply-to-field.js";
import * as m53 from "./fields/resent-bcc-field.js";
import * as m54 from "./fields/resent-cc-field.js";
import * as m55 from "./fields/resent-date-field.js";
import * as m56 from "./fields/resent-from-field.js";
import * as m57 from "./fields/resent-message-id-field.js";
import * as m58 from "./fields/resent-sender-field.js";
import * as m59 from "./fields/resent-to-field.js";
import * as m60 from "./fields/return-path-field.js";
import * as m61 from "./fields/sender-field.js";
import * as m62 from "./fields/structured-field.js";
import * as m63 from "./fields/subject-field.js";
import * as m64 from "./fields/to-field.js";
import * as m65 from "./fields/unstructured-field.js";
import * as m66 from "./header.js";
import * as m67 from "./indifferent-hash.js";
import * as m68 from "./message.js";
import * as m69 from "./multibyte.js";
import * as m70 from "./multibyte/chars.js";
import * as m71 from "./multibyte/unicode.js";
import * as m72 from "./parser-tools.js";
import * as m73 from "./parsers/address-lists-parser.js";
import * as m74 from "./parsers/content-disposition-parser.js";
import * as m75 from "./parsers/content-location-parser.js";
import * as m76 from "./parsers/content-transfer-encoding-parser.js";
import * as m77 from "./parsers/content-type-parser.js";
import * as m78 from "./parsers/date-time-parser.js";
import * as m79 from "./parsers/envelope-from-parser.js";
import * as m80 from "./parsers/message-ids-parser.js";
import * as m81 from "./parsers/mime-version-parser.js";
import * as m82 from "./parsers/phrase-lists-parser.js";
import * as m83 from "./parsers/received-parser.js";
import * as m84 from "./part.js";
import * as m85 from "./parts-list.js";
import * as m86 from "./utilities.js";

defineConstants([
  [() => m4.Address, "Mail::Address"],
  [() => m30.AddressContainer, "Mail::AddressContainer"],
  [() => m3.AddressList, "Mail::AddressList"],
  [() => m0.AttachmentsList, "Mail::AttachmentsList"],
  [() => m27.BccField, "Mail::BccField"],
  [() => m1.Body, "Mail::Body"],
  [() => m28.CcField, "Mail::CcField"],
  [() => m29.CommentsField, "Mail::CommentsField"],
  [() => m30.CommonAddressField, "Mail::CommonAddressField"],
  [() => m31.CommonDateField, "Mail::CommonDateField"],
  [() => m32.CommonField, "Mail::CommonField"],
  [() => m33.CommonMessageIdField, "Mail::CommonMessageIdField"],
  [() => m2.Configuration, "Mail::Configuration"],
  [() => m34.ContentDescriptionField, "Mail::ContentDescriptionField"],
  [() => m5.ContentDispositionElement, "Mail::ContentDispositionElement"],
  [() => m35.ContentDispositionField, "Mail::ContentDispositionField"],
  [() => m36.ContentIdField, "Mail::ContentIdField"],
  [() => m6.ContentLocationElement, "Mail::ContentLocationElement"],
  [() => m37.ContentLocationField, "Mail::ContentLocationField"],
  [() => m7.ContentTransferEncodingElement, "Mail::ContentTransferEncodingElement"],
  [() => m38.ContentTransferEncodingField, "Mail::ContentTransferEncodingField"],
  [() => m8.ContentTypeElement, "Mail::ContentTypeElement"],
  [() => m39.ContentTypeField, "Mail::ContentTypeField"],
  [() => m40.DateField, "Mail::DateField"],
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
  [() => m24.Envelope, "Mail::Envelope"],
  [() => m10.EnvelopeFromElement, "Mail::EnvelopeFromElement"],
  [() => m26.Field, "Mail::Field"],
  [() => m26.Field.FieldError, "Mail::Field::FieldError"],
  [() => m26.Field.IncompleteParseError, "Mail::Field::IncompleteParseError"],
  [() => m26.Field.NilParseError, "Mail::Field::NilParseError"],
  [() => m26.Field.ParseError, "Mail::Field::ParseError"],
  [() => m26.Field.SyntaxError, "Mail::Field::SyntaxError"],
  [() => m25.FieldList, "Mail::FieldList"],
  [() => m41.FromField, "Mail::FromField"],
  [() => m66.Header, "Mail::Header"],
  [() => m67.IndifferentHash, "Mail::IndifferentHash"],
  [() => m42.InReplyToField, "Mail::InReplyToField"],
  [() => m43.KeywordsField, "Mail::KeywordsField"],
  [() => m68.Message, "Mail::Message"],
  [() => m44.MessageIdField, "Mail::MessageIdField"],
  [() => m11.MessageIdsElement, "Mail::MessageIdsElement"],
  [() => m12.MimeVersionElement, "Mail::MimeVersionElement"],
  [() => m45.MimeVersionField, "Mail::MimeVersionField"],
  [() => m69.Multibyte, "Mail::Multibyte"],
  [() => m70.Chars, "Mail::Multibyte::Chars"],
  [() => m69.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m71.Unicode, "Mail::Multibyte::Unicode"],
  [() => m46.NamedStructuredField, "Mail::NamedStructuredField"],
  [() => m47.NamedUnstructuredField, "Mail::NamedUnstructuredField"],
  [() => m48.OptionalField, "Mail::OptionalField"],
  [() => m49.ParameterHash, "Mail::ParameterHash"],
  [() => m73.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m74.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m75.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m76.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m77.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m78.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m79.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m80.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m81.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m82.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [() => m83.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m72.ParserTools, "Mail::ParserTools"],
  [() => m84.Part, "Mail::Part"],
  [() => m85.PartsList, "Mail::PartsList"],
  [() => m13.PhraseList, "Mail::PhraseList"],
  [() => m14.ReceivedElement, "Mail::ReceivedElement"],
  [() => m50.ReceivedField, "Mail::ReceivedField"],
  [() => m51.ReferencesField, "Mail::ReferencesField"],
  [() => m52.ReplyToField, "Mail::ReplyToField"],
  [() => m53.ResentBccField, "Mail::ResentBccField"],
  [() => m54.ResentCcField, "Mail::ResentCcField"],
  [() => m55.ResentDateField, "Mail::ResentDateField"],
  [() => m56.ResentFromField, "Mail::ResentFromField"],
  [() => m57.ResentMessageIdField, "Mail::ResentMessageIdField"],
  [() => m58.ResentSenderField, "Mail::ResentSenderField"],
  [() => m59.ResentToField, "Mail::ResentToField"],
  [() => m60.ReturnPathField, "Mail::ReturnPathField"],
  [() => m61.SenderField, "Mail::SenderField"],
  [() => m62.StructuredField, "Mail::StructuredField"],
  [() => m63.SubjectField, "Mail::SubjectField"],
  [() => m64.ToField, "Mail::ToField"],
  [() => m15.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m65.UnstructuredField, "Mail::UnstructuredField"],
  [() => m86.Utilities, "Mail::Utilities"],
]);
