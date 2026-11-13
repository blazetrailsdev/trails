import { Autoload, extend, type Deprecation, type Extended } from "@blazetrails/activesupport";
import { HTML5 } from "@blazetrails/nokogiri";
import { TopLevel, constSet, type Gem } from "@blazetrails/ruby-compat";
import type { Attachable } from "./attachable.js";
import type { ContentAttachment } from "./attachables/content-attachment.js";
import type { MissingAttachable } from "./attachables/missing-attachable.js";
import type { RemoteImage } from "./attachables/remote-image.js";
import type { Attachment } from "./attachment.js";
import type { Attribute } from "./attribute.js";
import type { EncryptedRichText } from "./encrypted-rich-text.js";
import type { Encryption } from "./encryption.js";
import type { FixtureSet } from "./fixture-set.js";
import type { Record as ActionTextRecord } from "./record.js";
import type { RichText } from "./rich-text.js";
import type { Serialization } from "./serialization.js";
import type { AttachmentGallery } from "./attachment-gallery.js";
import type { Caching } from "./attachments/caching.js";
import type { Minification } from "./attachments/minification.js";
import type { TrixConversion } from "./attachments/trix-conversion.js";
import type { Content } from "./content.js";
import type { Fragment } from "./fragment.js";
import type { HtmlConversion } from "./html-conversion.js";
import type { PlainTextConversion } from "./plain-text-conversion.js";
import type { ContentHelper } from "./content-helper.js";
import type { TagHelper } from "./tag-helper.js";
import type { Rendering } from "./rendering.js";
import type { TrixAttachment } from "./trix-attachment.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_text/attachable": () => import("./attachable.js"),
  "action_text/attachables/content_attachment": () => import("./attachables/content-attachment.js"),
  "action_text/attachables/missing_attachable": () => import("./attachables/missing-attachable.js"),
  "action_text/attachables/remote_image": () => import("./attachables/remote-image.js"),
  "action_text/attachment": () => import("./attachment.js"),
  "action_text/attachment_gallery": () => import("./attachment-gallery.js"),
  "action_text/attribute": () => import("./attribute.js"),
  "action_text/attachments/caching": () => import("./attachments/caching.js"),
  "action_text/attachments/minification": () => import("./attachments/minification.js"),
  "action_text/attachments/trix_conversion": () => import("./attachments/trix-conversion.js"),
  "action_text/content": () => import("./content.js"),
  "action_text/encryption": () => import("./encryption.js"),
  "action_text/fixture_set": () => import("./fixture-set.js"),
  "action_text/fragment": () => import("./fragment.js"),
  "action_text/html_conversion": () => import("./html-conversion.js"),
  "action_text/plain_text_conversion": () => import("./plain-text-conversion.js"),
  "action_text/rendering": () => import("./rendering.js"),
  "action_text/serialization": () => import("./serialization.js"),
  "action_text/trix_attachment": () => import("./trix-attachment.js"),
};

type NokogiriConstants = { Nokogiri: { HTML5?: unknown; HTML4: typeof HTML5 } };

export const ActionText = {
  name: "ActionText",
  loadPath,

  htmlDocumentClass(): typeof HTML5.Document {
    if (Object.hasOwn(this, "_htmlDocumentClass")) return this._htmlDocumentClass!;
    return (this._htmlDocumentClass =
      (TopLevel as unknown as NokogiriConstants).Nokogiri.HTML5 !== undefined
        ? HTML5.Document
        : (TopLevel as unknown as NokogiriConstants).Nokogiri.HTML4.Document);
  },

  htmlDocumentFragmentClass(): typeof HTML5.DocumentFragment {
    if (Object.hasOwn(this, "_htmlDocumentFragmentClass")) return this._htmlDocumentFragmentClass!;
    return (this._htmlDocumentFragmentClass =
      (TopLevel as unknown as NokogiriConstants).Nokogiri.HTML5 !== undefined
        ? HTML5.DocumentFragment
        : (TopLevel as unknown as NokogiriConstants).Nokogiri.HTML4.DocumentFragment);
  },
} as AutoloadModule & {
  deprecator(): Deprecation;
  version(): InstanceType<typeof Gem.Version>;
  gemVersion(): InstanceType<typeof Gem.Version>;
  htmlDocumentClass(): typeof HTML5.Document;
  htmlDocumentFragmentClass(): typeof HTML5.DocumentFragment;
  /** @internal */
  _htmlDocumentClass?: typeof HTML5.Document;
  /** @internal */
  _htmlDocumentFragmentClass?: typeof HTML5.DocumentFragment;
  Attachable?: typeof Attachable;
  Attachables: typeof Attachables;
  Attachment?: typeof Attachment;
  AttachmentGallery?: typeof AttachmentGallery;
  Attachments: typeof Attachments;
  Attribute?: typeof Attribute;
  Content?: typeof Content;
  EncryptedRichText?: typeof EncryptedRichText;
  Encryption?: typeof Encryption;
  FixtureSet?: typeof FixtureSet;
  ContentHelper?: typeof ContentHelper;
  Fragment?: typeof Fragment;
  HtmlConversion?: typeof HtmlConversion;
  PlainTextConversion?: typeof PlainTextConversion;
  Record?: typeof ActionTextRecord;
  Rendering?: typeof Rendering;
  RichText?: typeof RichText;
  Serialization?: typeof Serialization;
  TagHelper?: typeof TagHelper;
  TrixAttachment?: typeof TrixAttachment;
};
extend(ActionText, Autoload);
constSet(TopLevel, "ActionText", ActionText);

ActionText.autoload("Attachable");
ActionText.autoload("Attachment");
ActionText.autoload("AttachmentGallery");
ActionText.autoload("Attribute");
ActionText.autoload("Content");
ActionText.autoload("Encryption");
ActionText.autoload("FixtureSet");
ActionText.autoload("Fragment");
ActionText.autoload("HtmlConversion");
ActionText.autoload("PlainTextConversion");
ActionText.autoload("Rendering");
ActionText.autoload("Serialization");
ActionText.autoload("TrixAttachment");

const Attachments = { name: "ActionText::Attachments", loadPath } as AutoloadModule & {
  Caching?: typeof Caching;
  Minification?: typeof Minification;
  TrixConversion?: typeof TrixConversion;
};
extend(Attachments, Autoload);
ActionText.Attachments = Attachments;

Attachments.autoload("Caching");
Attachments.autoload("Minification");
Attachments.autoload("TrixConversion");

const Attachables = { name: "ActionText::Attachables", loadPath } as AutoloadModule & {
  ContentAttachment?: typeof ContentAttachment;
  MissingAttachable?: typeof MissingAttachable;
  RemoteImage?: typeof RemoteImage;
};
extend(Attachables, Autoload);
ActionText.Attachables = Attachables;

Attachables.autoload("ContentAttachment");
Attachables.autoload("MissingAttachable");
Attachables.autoload("RemoteImage");
