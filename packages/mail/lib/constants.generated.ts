import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./attachments-list.js";
import * as m1 from "./body.js";
import * as m2 from "./check-delivery-params.js";
import * as m3 from "./configuration.js";
import * as m4 from "./elements/address-list.js";
import * as m5 from "./elements/address.js";
import * as m6 from "./elements/content-disposition-element.js";
import * as m7 from "./elements/content-location-element.js";
import * as m8 from "./elements/content-transfer-encoding-element.js";
import * as m9 from "./elements/content-type-element.js";
import * as m10 from "./elements/date-time-element.js";
import * as m11 from "./elements/envelope-from-element.js";
import * as m12 from "./elements/message-ids-element.js";
import * as m13 from "./elements/mime-version-element.js";
import * as m14 from "./elements/phrase-list.js";
import * as m15 from "./elements/received-element.js";
import * as m16 from "./encodings.js";
import * as m17 from "./encodings/7bit.js";
import * as m18 from "./encodings/8bit.js";
import * as m19 from "./encodings/base64.js";
import * as m20 from "./encodings/binary.js";
import * as m21 from "./encodings/identity.js";
import * as m22 from "./encodings/quoted-printable.js";
import * as m23 from "./encodings/transfer-encoding.js";
import * as m24 from "./encodings/unix-to-unix.js";
import * as m25 from "./envelope.js";
import * as m26 from "./field-list.js";
import * as m27 from "./field.js";
import * as m28 from "./fields/bcc-field.js";
import * as m29 from "./fields/cc-field.js";
import * as m30 from "./fields/comments-field.js";
import * as m31 from "./fields/common-address-field.js";
import * as m32 from "./fields/common-date-field.js";
import * as m33 from "./fields/common-field.js";
import * as m34 from "./fields/common-message-id-field.js";
import * as m35 from "./fields/content-description-field.js";
import * as m36 from "./fields/content-disposition-field.js";
import * as m37 from "./fields/content-id-field.js";
import * as m38 from "./fields/content-location-field.js";
import * as m39 from "./fields/content-transfer-encoding-field.js";
import * as m40 from "./fields/content-type-field.js";
import * as m41 from "./fields/date-field.js";
import * as m42 from "./fields/from-field.js";
import * as m43 from "./fields/in-reply-to-field.js";
import * as m44 from "./fields/keywords-field.js";
import * as m45 from "./fields/message-id-field.js";
import * as m46 from "./fields/mime-version-field.js";
import * as m47 from "./fields/named-structured-field.js";
import * as m48 from "./fields/named-unstructured-field.js";
import * as m49 from "./fields/optional-field.js";
import * as m50 from "./fields/parameter-hash.js";
import * as m51 from "./fields/received-field.js";
import * as m52 from "./fields/references-field.js";
import * as m53 from "./fields/reply-to-field.js";
import * as m54 from "./fields/resent-bcc-field.js";
import * as m55 from "./fields/resent-cc-field.js";
import * as m56 from "./fields/resent-date-field.js";
import * as m57 from "./fields/resent-from-field.js";
import * as m58 from "./fields/resent-message-id-field.js";
import * as m59 from "./fields/resent-sender-field.js";
import * as m60 from "./fields/resent-to-field.js";
import * as m61 from "./fields/return-path-field.js";
import * as m62 from "./fields/sender-field.js";
import * as m63 from "./fields/structured-field.js";
import * as m64 from "./fields/subject-field.js";
import * as m65 from "./fields/to-field.js";
import * as m66 from "./fields/unstructured-field.js";
import * as m67 from "./header.js";
import * as m68 from "./indifferent-hash.js";
import * as m69 from "./message.js";
import * as m70 from "./multibyte.js";
import * as m71 from "./multibyte/chars.js";
import * as m72 from "./multibyte/unicode.js";
import * as m73 from "./network/delivery-methods/exim.js";
import * as m74 from "./network/delivery-methods/file-delivery.js";
import * as m75 from "./network/delivery-methods/logger-delivery.js";
import * as m76 from "./network/delivery-methods/sendmail.js";
import * as m77 from "./network/delivery-methods/smtp-connection.js";
import * as m78 from "./network/delivery-methods/smtp.js";
import * as m79 from "./network/delivery-methods/test-mailer.js";
import * as m80 from "./parser-tools.js";
import * as m81 from "./parsers/address-lists-parser.js";
import * as m82 from "./parsers/content-disposition-parser.js";
import * as m83 from "./parsers/content-location-parser.js";
import * as m84 from "./parsers/content-transfer-encoding-parser.js";
import * as m85 from "./parsers/content-type-parser.js";
import * as m86 from "./parsers/date-time-parser.js";
import * as m87 from "./parsers/envelope-from-parser.js";
import * as m88 from "./parsers/message-ids-parser.js";
import * as m89 from "./parsers/mime-version-parser.js";
import * as m90 from "./parsers/phrase-lists-parser.js";
import * as m91 from "./parsers/received-parser.js";
import * as m92 from "./part.js";
import * as m93 from "./parts-list.js";
import * as m94 from "./smtp-envelope.js";
import * as m95 from "./utilities.js";
import * as m96 from "./yaml.js";

defineConstants([
  [() => m5.Address, "Mail::Address"],
  [() => m31.AddressContainer, "Mail::AddressContainer"],
  [() => m4.AddressList, "Mail::AddressList"],
  [() => m0.AttachmentsList, "Mail::AttachmentsList"],
  [() => m28.BccField, "Mail::BccField"],
  [() => m1.Body, "Mail::Body"],
  [() => m29.CcField, "Mail::CcField"],
  [() => m2.CheckDeliveryParams, "Mail::CheckDeliveryParams"],
  [() => m30.CommentsField, "Mail::CommentsField"],
  [() => m31.CommonAddressField, "Mail::CommonAddressField"],
  [() => m32.CommonDateField, "Mail::CommonDateField"],
  [() => m33.CommonField, "Mail::CommonField"],
  [() => m34.CommonMessageIdField, "Mail::CommonMessageIdField"],
  [() => m3.Configuration, "Mail::Configuration"],
  [() => m35.ContentDescriptionField, "Mail::ContentDescriptionField"],
  [() => m6.ContentDispositionElement, "Mail::ContentDispositionElement"],
  [() => m36.ContentDispositionField, "Mail::ContentDispositionField"],
  [() => m37.ContentIdField, "Mail::ContentIdField"],
  [() => m7.ContentLocationElement, "Mail::ContentLocationElement"],
  [() => m38.ContentLocationField, "Mail::ContentLocationField"],
  [() => m8.ContentTransferEncodingElement, "Mail::ContentTransferEncodingElement"],
  [() => m39.ContentTransferEncodingField, "Mail::ContentTransferEncodingField"],
  [() => m9.ContentTypeElement, "Mail::ContentTypeElement"],
  [() => m40.ContentTypeField, "Mail::ContentTypeField"],
  [() => m41.DateField, "Mail::DateField"],
  [() => m10.DateTimeElement, "Mail::DateTimeElement"],
  [() => m16.Encodings, "Mail::Encodings"],
  [() => m19.Base64, "Mail::Encodings::Base64"],
  [() => m20.Binary, "Mail::Encodings::Binary"],
  [() => m18.EightBit, "Mail::Encodings::EightBit"],
  [() => m21.Identity, "Mail::Encodings::Identity"],
  [() => m22.QuotedPrintable, "Mail::Encodings::QuotedPrintable"],
  [() => m17.SevenBit, "Mail::Encodings::SevenBit"],
  [() => m23.TransferEncoding, "Mail::Encodings::TransferEncoding"],
  [() => m24.UnixToUnix, "Mail::Encodings::UnixToUnix"],
  [() => m25.Envelope, "Mail::Envelope"],
  [() => m11.EnvelopeFromElement, "Mail::EnvelopeFromElement"],
  [() => m73.Exim, "Mail::Exim"],
  [() => m27.Field, "Mail::Field"],
  [() => m27.Field.FieldError, "Mail::Field::FieldError"],
  [() => m27.Field.IncompleteParseError, "Mail::Field::IncompleteParseError"],
  [() => m27.Field.NilParseError, "Mail::Field::NilParseError"],
  [() => m27.Field.ParseError, "Mail::Field::ParseError"],
  [() => m27.Field.SyntaxError, "Mail::Field::SyntaxError"],
  [() => m26.FieldList, "Mail::FieldList"],
  [() => m74.FileDelivery, "Mail::FileDelivery"],
  [() => m42.FromField, "Mail::FromField"],
  [() => m67.Header, "Mail::Header"],
  [() => m68.IndifferentHash, "Mail::IndifferentHash"],
  [() => m43.InReplyToField, "Mail::InReplyToField"],
  [() => m44.KeywordsField, "Mail::KeywordsField"],
  [() => m75.LoggerDelivery, "Mail::LoggerDelivery"],
  [() => m69.Message, "Mail::Message"],
  [() => m45.MessageIdField, "Mail::MessageIdField"],
  [() => m12.MessageIdsElement, "Mail::MessageIdsElement"],
  [() => m13.MimeVersionElement, "Mail::MimeVersionElement"],
  [() => m46.MimeVersionField, "Mail::MimeVersionField"],
  [() => m70.Multibyte, "Mail::Multibyte"],
  [() => m71.Chars, "Mail::Multibyte::Chars"],
  [() => m70.EncodingError, "Mail::Multibyte::EncodingError"],
  [() => m72.Unicode, "Mail::Multibyte::Unicode"],
  [() => m47.NamedStructuredField, "Mail::NamedStructuredField"],
  [() => m48.NamedUnstructuredField, "Mail::NamedUnstructuredField"],
  [() => m49.OptionalField, "Mail::OptionalField"],
  [() => m50.ParameterHash, "Mail::ParameterHash"],
  [() => m81.AddressListsParser, "Mail::Parsers::AddressListsParser"],
  [() => m82.ContentDispositionParser, "Mail::Parsers::ContentDispositionParser"],
  [() => m83.ContentLocationParser, "Mail::Parsers::ContentLocationParser"],
  [() => m84.ContentTransferEncodingParser, "Mail::Parsers::ContentTransferEncodingParser"],
  [() => m85.ContentTypeParser, "Mail::Parsers::ContentTypeParser"],
  [() => m86.DateTimeParser, "Mail::Parsers::DateTimeParser"],
  [() => m87.EnvelopeFromParser, "Mail::Parsers::EnvelopeFromParser"],
  [() => m88.MessageIdsParser, "Mail::Parsers::MessageIdsParser"],
  [() => m89.MimeVersionParser, "Mail::Parsers::MimeVersionParser"],
  [() => m90.PhraseListsParser, "Mail::Parsers::PhraseListsParser"],
  [
    () => m90.PhraseListsParser.PhraseListsStruct,
    "Mail::Parsers::PhraseListsParser::PhraseListsStruct",
  ],
  [() => m91.ReceivedParser, "Mail::Parsers::ReceivedParser"],
  [() => m80.ParserTools, "Mail::ParserTools"],
  [() => m92.Part, "Mail::Part"],
  [() => m93.PartsList, "Mail::PartsList"],
  [() => m14.PhraseList, "Mail::PhraseList"],
  [() => m15.ReceivedElement, "Mail::ReceivedElement"],
  [() => m51.ReceivedField, "Mail::ReceivedField"],
  [() => m52.ReferencesField, "Mail::ReferencesField"],
  [() => m53.ReplyToField, "Mail::ReplyToField"],
  [() => m54.ResentBccField, "Mail::ResentBccField"],
  [() => m55.ResentCcField, "Mail::ResentCcField"],
  [() => m56.ResentDateField, "Mail::ResentDateField"],
  [() => m57.ResentFromField, "Mail::ResentFromField"],
  [() => m58.ResentMessageIdField, "Mail::ResentMessageIdField"],
  [() => m59.ResentSenderField, "Mail::ResentSenderField"],
  [() => m60.ResentToField, "Mail::ResentToField"],
  [() => m61.ReturnPathField, "Mail::ReturnPathField"],
  [() => m62.SenderField, "Mail::SenderField"],
  [() => m76.Sendmail, "Mail::Sendmail"],
  [() => m76.DeliveryError, "Mail::Sendmail::DeliveryError"],
  [() => m78.SMTP, "Mail::SMTP"],
  [() => m77.SMTPConnection, "Mail::SMTPConnection"],
  [() => m94.SmtpEnvelope, "Mail::SmtpEnvelope"],
  [() => m63.StructuredField, "Mail::StructuredField"],
  [() => m64.SubjectField, "Mail::SubjectField"],
  [() => m79.TestMailer, "Mail::TestMailer"],
  [() => m65.ToField, "Mail::ToField"],
  [() => m16.UnknownEncodingType, "Mail::UnknownEncodingType"],
  [() => m66.UnstructuredField, "Mail::UnstructuredField"],
  [() => m95.Utilities, "Mail::Utilities"],
  [() => m96.YAML, "Mail::YAML"],
]);
