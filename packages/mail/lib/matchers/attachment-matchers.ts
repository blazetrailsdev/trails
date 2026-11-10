import type { Message } from "../message.js";

export class AnyAttachmentMatcher {
  caseEquals(other: Message): boolean {
    return other.isAttachment();
  }
}

export class AttachmentFilenameMatcher {
  readonly filename: unknown;

  constructor(filename: unknown) {
    this.filename = filename;
  }

  caseEquals(other: Message): boolean {
    return other.isAttachment() && other.filename() === this.filename;
  }
}

export class AttachmentMimeTypeMatcher {
  readonly mimeType: unknown;

  constructor(mimeType: unknown) {
    this.mimeType = mimeType;
  }

  caseEquals(other: Message): boolean {
    return other.isAttachment() && other.mimeType() === this.mimeType;
  }
}

export const Matchers = {
  anyAttachment(): AnyAttachmentMatcher {
    return new AnyAttachmentMatcher();
  },

  anAttachmentWithFilename(filename: unknown): AttachmentFilenameMatcher {
    return new AttachmentFilenameMatcher(filename);
  },

  anAttachmentWithMimeType(filename: unknown): AttachmentMimeTypeMatcher {
    return new AttachmentMimeTypeMatcher(filename);
  },

  AnyAttachmentMatcher,
  AttachmentFilenameMatcher,
  AttachmentMimeTypeMatcher,
};
