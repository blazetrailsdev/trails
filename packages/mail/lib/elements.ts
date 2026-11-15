import { Mail } from "./mail.js";

Mail.registerAutoload("Address", "elements/address");
Mail.registerAutoload("AddressList", "elements/address-list");
Mail.registerAutoload("ContentDispositionElement", "elements/content-disposition-element");
Mail.registerAutoload("ContentLocationElement", "elements/content-location-element");
Mail.registerAutoload(
  "ContentTransferEncodingElement",
  "elements/content-transfer-encoding-element",
);
Mail.registerAutoload("ContentTypeElement", "elements/content-type-element");
Mail.registerAutoload("DateTimeElement", "elements/date-time-element");
Mail.registerAutoload("EnvelopeFromElement", "elements/envelope-from-element");
Mail.registerAutoload("MessageIdsElement", "elements/message-ids-element");
Mail.registerAutoload("MimeVersionElement", "elements/mime-version-element");
Mail.registerAutoload("PhraseList", "elements/phrase-list");
Mail.registerAutoload("ReceivedElement", "elements/received-element");
