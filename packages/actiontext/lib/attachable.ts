import { Concern, extend, tryCall, type Extended } from "@blazetrails/activesupport";
import { RecordNotFound } from "@blazetrails/activerecord";
import { Locator } from "@blazetrails/globalid";
import type { Html5Node } from "@blazetrails/nokogiri";
import { rbCallSuper, rbObjRespondTo, toS } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { ContentAttachment } from "./attachables/content-attachment.js";
import { MissingAttachable } from "./attachables/missing-attachable.js";
import { RemoteImage } from "./attachables/remote-image.js";

interface AttachableHost {
  toSgid(options: Record<string, unknown>): { toString(): string };
  toPartialPath(): string;
  isPersisted(): boolean;
  attachableSgid(): string;
  attachableContentType(): unknown;
  attachableFilename(): string | null | undefined;
  attachableFilesize(): unknown;
  attachableMetadata(): Record<string, unknown>;
  isPreviewableAttachable(): boolean;
}

function attributeNamesForSerialization(this: AttachableHost): string[] {
  return [...(rbCallSuper(this, attributeNamesForSerialization) as string[]), "attachable_sgid"];
}

function readAttributeForSerialization(this: AttachableHost, key: string): unknown {
  if (key === "attachable_sgid") {
    return this.isPersisted() ? rbCallSuper(this, readAttributeForSerialization, key) : null;
  } else {
    return rbCallSuper(this, readAttributeForSerialization, key);
  }
}

export const Attachable = {
  attachableSgid(this: AttachableHost): string {
    return this.toSgid({ expiresIn: null, for: Attachable.LOCATOR_NAME }).toString();
  },

  attachableContentType(this: AttachableHost): unknown {
    return tryCall(this, "contentType") ?? "application/octet-stream";
  },

  attachableFilename(this: AttachableHost & { filename: unknown }): string | null {
    if (rbObjRespondTo(this, "filename")) return toS(this.filename);
    return null;
  },

  attachableFilesize(this: AttachableHost): unknown {
    return tryCall(this, "byteSize") ?? tryCall(this, "filesize");
  },

  attachableMetadata(this: AttachableHost): Record<string, unknown> {
    return (tryCall(this, "metadata") as Record<string, unknown> | null) ?? {};
  },

  isPreviewableAttachable(this: AttachableHost): boolean {
    return false;
  },

  toTrixContentAttachmentPartialPath(this: AttachableHost): unknown {
    return this.toPartialPath();
  },

  toAttachablePartialPath(this: AttachableHost): unknown {
    return this.toPartialPath();
  },

  toRichTextAttributes(
    this: AttachableHost,
    attributes: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const attrs: Record<string, unknown> = { ...attributes };
    attrs["sgid"] = this.attachableSgid();
    attrs["contentType"] = this.attachableContentType();
    if (this.isPreviewableAttachable()) attrs["previewable"] = true;
    attrs["filename"] = this.attachableFilename();
    attrs["filesize"] = this.attachableFilesize();
    attrs["width"] = this.attachableMetadata()["width"];
    attrs["height"] = this.attachableMetadata()["height"];
    return Object.fromEntries(Object.entries(attrs).filter(([, v]) => v != null));
  },

  /** @internal */
  attributeNamesForSerialization,
  /** @internal */
  readAttributeForSerialization,
} as Extended<typeof Concern> & {
  attachableSgid(this: AttachableHost): string;
  attachableContentType(this: AttachableHost): unknown;
  attachableFilename(this: AttachableHost): string | null;
  attachableFilesize(this: AttachableHost): unknown;
  attachableMetadata(this: AttachableHost): Record<string, unknown>;
  isPreviewableAttachable(this: AttachableHost): boolean;
  toTrixContentAttachmentPartialPath(this: AttachableHost): unknown;
  toAttachablePartialPath(this: AttachableHost): unknown;
  toRichTextAttributes(
    this: AttachableHost,
    attributes?: Record<string, unknown>,
  ): Record<string, unknown>;
  /** @internal */
  attributeNamesForSerialization: typeof attributeNamesForSerialization;
  /** @internal */
  readAttributeForSerialization: typeof readAttributeForSerialization;
  LOCATOR_NAME: string;
  fromNode(node: Html5Node): Promise<unknown>;
  fromAttachableSgid(sgid: unknown, options?: Record<string, unknown>): Promise<unknown>;
  /** @internal */
  attachableFromSgid(sgid: unknown): Promise<unknown>;
};
extend(Attachable, Concern);

Object.defineProperties(Attachable, {
  LOCATOR_NAME: { value: "attachable", enumerable: false },

  fromNode: {
    enumerable: false,
    async value(node: Html5Node): Promise<unknown> {
      let attachable: unknown;
      if ((attachable = await Attachable.attachableFromSgid(node.get("sgid")))) {
        return attachable;
      } else if ((attachable = await ContentAttachment.fromNode(node))) {
        return attachable;
      } else if ((attachable = RemoteImage.fromNode(node))) {
        return attachable;
      } else {
        return new MissingAttachable(node.get("sgid"));
      }
    },
  },

  fromAttachableSgid: {
    enumerable: false,
    async value(sgid: unknown, options: Record<string, unknown> = {}): Promise<unknown> {
      const record = Array.isArray(sgid)
        ? await Locator.locateManySigned(sgid, { ...options, for: Attachable.LOCATOR_NAME })
        : await Locator.locateSigned(sgid as string, { ...options, for: Attachable.LOCATOR_NAME });
      if (record == null) throw new RecordNotFound();
      return record;
    },
  },

  attachableFromSgid: {
    enumerable: false,
    async value(sgid: unknown): Promise<unknown> {
      try {
        return await Attachable.fromAttachableSgid(sgid);
      } catch (error) {
        if (error instanceof RecordNotFound) return null;
        throw error;
      }
    },
  },
});

Attachable.classMethods((mod) => {
  mod.fromAttachableSgid = function (this: unknown, sgid: unknown): Promise<unknown> {
    return Attachable.fromAttachableSgid(sgid, { only: this });
  };

  mod.toMissingAttachablePartialPath = function (): string {
    return MissingAttachable.DEFAULT_PARTIAL_PATH;
  };
});

ActionText.Attachable = Attachable;
