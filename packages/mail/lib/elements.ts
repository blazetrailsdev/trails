import { Mail } from "./mail.js";

Mail.registerAutoload("Address", "./elements/address.js");
Mail.registerAutoload("AddressList", "./elements/address-list.js");
Mail.registerAutoload("ContentDispositionElement", "./elements/content-disposition-element.js");
Mail.registerAutoload("ContentLocationElement", "./elements/content-location-element.js");
Mail.registerAutoload(
  "ContentTransferEncodingElement",
  "./elements/content-transfer-encoding-element.js",
);
Mail.registerAutoload("ContentTypeElement", "./elements/content-type-element.js");
Mail.registerAutoload("DateTimeElement", "./elements/date-time-element.js");
Mail.registerAutoload("EnvelopeFromElement", "./elements/envelope-from-element.js");
Mail.registerAutoload("MessageIdsElement", "./elements/message-ids-element.js");
Mail.registerAutoload("MimeVersionElement", "./elements/mime-version-element.js");
Mail.registerAutoload("PhraseList", "./elements/phrase-list.js");
Mail.registerAutoload("ReceivedElement", "./elements/received-element.js");
