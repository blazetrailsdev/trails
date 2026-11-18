import { Concern, extend } from "@blazetrails/activesupport";
import { RecordNotUnique, type Base } from "@blazetrails/activerecord";
import { Blob } from "@blazetrails/activestorage/blob";
import { Mail, MessageIdField } from "@blazetrails/mail";
import { OpenSSL, Socket, StringIO } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../action-mailbox.js";

type MessageIdHost = typeof Base & typeof ClassMethods;

export async function createAndExtractMessageIdBang(
  this: MessageIdHost,
  source: string | Uint8Array,
  options: Record<string, unknown> = {},
): Promise<Base | null> {
  try {
    const messageChecksum = OpenSSL.Digest.SHA1.hexdigest(source);
    const messageId =
      this.extractMessageId(source) ?? this.generateMissingMessageId(messageChecksum);

    return await this.createBang({
      rawEmail: await this.createAndUploadRawEmailBang(source),
      message_id: messageId,
      message_checksum: messageChecksum,
      ...options,
    });
  } catch (error) {
    if (error instanceof RecordNotUnique) return null;
    throw error;
  }
}

/** @internal */
function extractMessageId(source: string | Uint8Array): string | null {
  try {
    return Mail.fromSource(source).messageId() as string | null;
  } catch {
    return null;
  }
}

/** @internal */
function generateMissingMessageId(this: MessageIdHost, messageChecksum: string): string {
  const messageId = new MessageIdField(
    `<${messageChecksum}@${Socket.gethostname()}.mail>`,
  ).messageId()!;
  this.logger!.warn(
    `Message-ID couldn't be parsed or is missing. Generated a new Message-ID: ${messageId}`,
  );
  return messageId;
}

/** @internal */
async function createAndUploadRawEmailBang(source: string | Uint8Array): Promise<Blob> {
  return await Blob.createAndUploadBang({
    io: new StringIO(source),
    filename: "message.eml",
    contentType: "message/rfc822",
    serviceName: ActionMailbox.storageService,
  });
}

export const ClassMethods = {
  createAndExtractMessageIdBang,
  extractMessageId,
  generateMissingMessageId,
  createAndUploadRawEmailBang,
};

export const MessageId = { ClassMethods };
extend(MessageId, Concern);
