import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./app/helpers/action-text/content-helper.js";
import * as m1 from "./app/helpers/action-text/tag-helper.js";
import * as m2 from "./attachable.js";
import * as m3 from "./attachables/content-attachment.js";
import * as m4 from "./attachables/missing-attachable.js";
import * as m5 from "./attachables/remote-image.js";
import * as m6 from "./attachment-gallery.js";
import * as m7 from "./attachment.js";
import * as m8 from "./attachments/caching.js";
import * as m9 from "./attachments/minification.js";
import * as m10 from "./attachments/trix-conversion.js";
import * as m11 from "./attribute.js";
import * as m12 from "./content.js";
import * as m13 from "./fragment.js";
import * as m14 from "./gem-version.js";
import * as m15 from "./html-conversion.js";
import * as m16 from "./plain-text-conversion.js";
import * as m17 from "./rendering.js";
import * as m18 from "./serialization.js";
import * as m19 from "./trix-attachment.js";

defineConstants([
  [m2, "Attachable", "ActionText::Attachable"],
  [m2, "Attachable.ClassMethods", "ActionText::Attachable::ClassMethods"],
  [m3, "ContentAttachment", "ActionText::Attachables::ContentAttachment"],
  [m4, "MissingAttachable", "ActionText::Attachables::MissingAttachable"],
  [m5, "RemoteImage", "ActionText::Attachables::RemoteImage"],
  [m7, "Attachment", "ActionText::Attachment"],
  [m6, "AttachmentGallery", "ActionText::AttachmentGallery"],
  [m8, "Caching", "ActionText::Attachments::Caching"],
  [m9, "Minification", "ActionText::Attachments::Minification"],
  [m9, "Minification.ClassMethods", "ActionText::Attachments::Minification::ClassMethods"],
  [m10, "TrixConversion", "ActionText::Attachments::TrixConversion"],
  [m10, "TrixConversion.ClassMethods", "ActionText::Attachments::TrixConversion::ClassMethods"],
  [m11, "Attribute", "ActionText::Attribute"],
  [m12, "Content", "ActionText::Content"],
  [m0, "ContentHelper", "ActionText::ContentHelper"],
  [m13, "Fragment", "ActionText::Fragment"],
  [m15, "HtmlConversion", "ActionText::HtmlConversion"],
  [m16, "PlainTextConversion", "ActionText::PlainTextConversion"],
  [m17, "Rendering", "ActionText::Rendering"],
  [m17, "Rendering.ClassMethods", "ActionText::Rendering::ClassMethods"],
  [m18, "Serialization", "ActionText::Serialization"],
  [m1, "TagHelper", "ActionText::TagHelper"],
  [m19, "TrixAttachment", "ActionText::TrixAttachment"],
  [m14, "VERSION", "ActionText::VERSION"],
  [m1, "ActionText", "ActionView::Helpers::Tags::ActionText"],
  [m1, "FormBuilder", "App::Helpers::ActionText::TagHelper::FormBuilder"],
  [m1, "FormHelper", "App::Helpers::ActionText::TagHelper::FormHelper"],
]);
