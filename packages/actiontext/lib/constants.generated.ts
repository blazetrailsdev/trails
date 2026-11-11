import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./attachable.js";
import * as m1 from "./attachables/content-attachment.js";
import * as m2 from "./attachables/missing-attachable.js";
import * as m3 from "./attachables/remote-image.js";
import * as m4 from "./attachment-gallery.js";
import * as m5 from "./attachment.js";
import * as m6 from "./attachments/caching.js";
import * as m7 from "./attachments/minification.js";
import * as m8 from "./attachments/trix-conversion.js";
import * as m9 from "./content.js";
import * as m10 from "./fragment.js";
import * as m11 from "./gem-version.js";
import * as m12 from "./html-conversion.js";
import * as m13 from "./plain-text-conversion.js";
import * as m14 from "./rendering.js";
import * as m15 from "./trix-attachment.js";

defineConstants([
  [() => m0.Attachable, "ActionText::Attachable"],
  [() => m1.ContentAttachment, "ActionText::Attachables::ContentAttachment"],
  [() => m2.MissingAttachable, "ActionText::Attachables::MissingAttachable"],
  [() => m3.RemoteImage, "ActionText::Attachables::RemoteImage"],
  [() => m5.Attachment, "ActionText::Attachment"],
  [() => m4.AttachmentGallery, "ActionText::AttachmentGallery"],
  [() => m6.Caching, "ActionText::Attachments::Caching"],
  [() => m7.Minification, "ActionText::Attachments::Minification"],
  [() => m8.TrixConversion, "ActionText::Attachments::TrixConversion"],
  [() => m9.Content, "ActionText::Content"],
  [() => m10.Fragment, "ActionText::Fragment"],
  [() => m12.HtmlConversion, "ActionText::HtmlConversion"],
  [() => m13.PlainTextConversion, "ActionText::PlainTextConversion"],
  [() => m14.Rendering, "ActionText::Rendering"],
  [() => m15.TrixAttachment, "ActionText::TrixAttachment"],
  [() => m11.VERSION, "ActionText::VERSION"],
]);
