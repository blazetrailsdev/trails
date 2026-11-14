import { Mail } from "./mail.js";

Mail.registerAutoload("UnstructuredField", "./fields/unstructured-field.js");
Mail.registerAutoload("StructuredField", "./fields/structured-field.js");
Mail.registerAutoload("OptionalField", "./fields/optional-field.js");

Mail.registerAutoload("BccField", "./fields/bcc-field.js");
Mail.registerAutoload("CcField", "./fields/cc-field.js");
Mail.registerAutoload("CommentsField", "./fields/comments-field.js");
Mail.registerAutoload("ContentDescriptionField", "./fields/content-description-field.js");
Mail.registerAutoload("ContentDispositionField", "./fields/content-disposition-field.js");
Mail.registerAutoload("ContentIdField", "./fields/content-id-field.js");
Mail.registerAutoload("ContentLocationField", "./fields/content-location-field.js");
Mail.registerAutoload(
  "ContentTransferEncodingField",
  "./fields/content-transfer-encoding-field.js",
);
Mail.registerAutoload("ContentTypeField", "./fields/content-type-field.js");
Mail.registerAutoload("DateField", "./fields/date-field.js");
Mail.registerAutoload("FromField", "./fields/from-field.js");
Mail.registerAutoload("InReplyToField", "./fields/in-reply-to-field.js");
Mail.registerAutoload("KeywordsField", "./fields/keywords-field.js");
Mail.registerAutoload("MessageIdField", "./fields/message-id-field.js");
Mail.registerAutoload("MimeVersionField", "./fields/mime-version-field.js");
Mail.registerAutoload("ReceivedField", "./fields/received-field.js");
Mail.registerAutoload("ReferencesField", "./fields/references-field.js");
Mail.registerAutoload("ReplyToField", "./fields/reply-to-field.js");
Mail.registerAutoload("ResentBccField", "./fields/resent-bcc-field.js");
Mail.registerAutoload("ResentCcField", "./fields/resent-cc-field.js");
Mail.registerAutoload("ResentDateField", "./fields/resent-date-field.js");
Mail.registerAutoload("ResentFromField", "./fields/resent-from-field.js");
Mail.registerAutoload("ResentMessageIdField", "./fields/resent-message-id-field.js");
Mail.registerAutoload("ResentSenderField", "./fields/resent-sender-field.js");
Mail.registerAutoload("ResentToField", "./fields/resent-to-field.js");
Mail.registerAutoload("ReturnPathField", "./fields/return-path-field.js");
Mail.registerAutoload("SenderField", "./fields/sender-field.js");
Mail.registerAutoload("SubjectField", "./fields/subject-field.js");
Mail.registerAutoload("ToField", "./fields/to-field.js");
