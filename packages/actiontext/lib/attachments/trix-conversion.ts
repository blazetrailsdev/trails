import { Concern, extend, tryCall, type Extended } from "@blazetrails/activesupport";
import { ActionText } from "../action-text.js";
import { Fragment } from "../fragment.js";
import { TrixAttachment } from "../trix-attachment.js";

interface TrixConversionHost {
  attachable: object;
  fullAttributes(): Record<string, unknown>;
  modelName: { element: string };
  trixAttachmentContent(): unknown;
}

interface TrixConversionClass {
  fromAttributes(attributes: Record<string, unknown>): Promise<unknown>;
  fromTrixAttachment(trixAttachment: TrixAttachment): Promise<unknown>;
}

export const TrixConversion = {
  async toTrixAttachment(
    this: TrixConversionHost,
    content: unknown = this.trixAttachmentContent(),
  ): Promise<TrixAttachment> {
    content = await content;
    const attributes = { ...this.fullAttributes() };
    if (content != null && content !== false) attributes["content"] = content;
    return TrixAttachment.fromAttributes(attributes);
  },

  /** @internal */
  trixAttachmentContent(this: TrixConversionHost): unknown {
    const partialPath = tryCall(this.attachable, "toTrixContentAttachmentPartialPath");
    if (partialPath != null && partialPath !== false) {
      return ActionText.Content!.render({
        partial: partialPath,
        formats: "html",
        object: this,
        as: this.modelName.element,
      });
    }
    return null;
  },
} as Extended<typeof Concern> & {
  toTrixAttachment(this: TrixConversionHost, content?: unknown): Promise<TrixAttachment>;
  trixAttachmentContent(this: TrixConversionHost): unknown;
};
extend(TrixConversion, Concern);

TrixConversion.classMethods((mod) => {
  mod.fragmentByConvertingTrixAttachments = function (
    this: TrixConversionClass,
    content: unknown,
  ): Promise<Fragment> {
    return Fragment.wrap(content).replace(TrixAttachment.SELECTOR, (node) =>
      this.fromTrixAttachment(new TrixAttachment(node)),
    );
  };

  mod.fromTrixAttachment = function (
    this: TrixConversionClass,
    trixAttachment: TrixAttachment,
  ): Promise<unknown> {
    return this.fromAttributes(trixAttachment.attributes);
  };
});

ActionText.Attachments.TrixConversion = TrixConversion;
