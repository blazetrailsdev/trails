import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./attachment-gallery.js";
import * as m1 from "./attachment.js";
import * as m2 from "./attachments/caching.js";
import * as m3 from "./attachments/minification.js";
import * as m4 from "./attachments/trix-conversion.js";
import * as m5 from "./fragment.js";
import * as m6 from "./gem-version.js";
import * as m7 from "./html-conversion.js";
import * as m8 from "./plain-text-conversion.js";
import * as m9 from "./trix-attachment.js";

defineConstants([
  [() => m1.Attachment, "ActionText::Attachment"],
  [() => m0.AttachmentGallery, "ActionText::AttachmentGallery"],
  [() => m2.Caching, "ActionText::Attachments::Caching"],
  [() => m3.Minification, "ActionText::Attachments::Minification"],
  [() => m4.TrixConversion, "ActionText::Attachments::TrixConversion"],
  [() => m5.Fragment, "ActionText::Fragment"],
  [() => m7.HtmlConversion, "ActionText::HtmlConversion"],
  [() => m8.PlainTextConversion, "ActionText::PlainTextConversion"],
  [() => m9.TrixAttachment, "ActionText::TrixAttachment"],
  [() => m6.VERSION, "ActionText::VERSION"],
]);
