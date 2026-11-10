import { rbEqual } from "@blazetrails/ruby-compat";
import type { Message } from "../message.js";
import { HasSentEmailMatcher, haveSentEmail } from "./has-sent-mail.js";

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
    return other.isAttachment() && rbEqual(other.filename(), this.filename);
  }
}

export class AttachmentMimeTypeMatcher {
  readonly mimeType: unknown;

  constructor(mimeType: unknown) {
    this.mimeType = mimeType;
  }

  caseEquals(other: Message): boolean {
    return other.isAttachment() && rbEqual(other.mimeType(), this.mimeType);
  }
}

export const Matchers = {
  haveSentEmail,

  anyAttachment(): AnyAttachmentMatcher {
    return new AnyAttachmentMatcher();
  },

  anAttachmentWithFilename(filename: unknown): AttachmentFilenameMatcher {
    return new AttachmentFilenameMatcher(filename);
  },

  anAttachmentWithMimeType(filename: unknown): AttachmentMimeTypeMatcher {
    return new AttachmentMimeTypeMatcher(filename);
  },

  HasSentEmailMatcher,
  AnyAttachmentMatcher,
  AttachmentFilenameMatcher,
  AttachmentMimeTypeMatcher,
};
