import { Concern, extend } from "@blazetrails/activesupport";
import { RecordNotUnique, type Base } from "@blazetrails/activerecord";
import { Blob } from "@blazetrails/activestorage/blob";
import { Mail, MessageIdField } from "@blazetrails/mail";
import { OpenSSL, Socket, StringIO } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../action-mailbox.js";

type MessageIdHost = typeof Base & typeof ClassMethods;

class ClassMethods {
  static async createAndExtractMessageIdBang(
    this: MessageIdHost,
    source: string,
    options: Record<string, unknown> = {},
  ): Promise<Base | null> {
    try {
      const messageChecksum = OpenSSL.Digest.SHA1.hexdigest(source);
      const messageId =
        this.extractMessageId(source) ?? this.generateMissingMessageId(messageChecksum);

      return (await this.createBang({
        rawEmail: await this.createAndUploadRawEmailBang(source),
        message_id: messageId,
        message_checksum: messageChecksum,
        ...options,
      })) as Base;
    } catch (error) {
      if (error instanceof RecordNotUnique) return null;
      throw error;
    }
  }

  /** @internal */
  private static extractMessageId(source: string): string | null {
    try {
      return Mail.fromSource(source).messageId() as string | null;
    } catch {
      return null;
    }
  }

  /** @internal */
  private static generateMissingMessageId(this: MessageIdHost, messageChecksum: string): string {
    const messageId = new MessageIdField(
      `<${messageChecksum}@${Socket.gethostname()}.mail>`,
    ).messageId()!;
    this.logger!.warn(
      `Message-ID couldn't be parsed or is missing. Generated a new Message-ID: ${messageId}`,
    );
    return messageId;
  }

  /** @internal */
  private static async createAndUploadRawEmailBang(source: string): Promise<Blob> {
    return await Blob.createAndUploadBang({
      io: new StringIO(source),
      filename: "message.eml",
      contentType: "message/rfc822",
      serviceName: ActionMailbox.storageService,
    });
  }
}

export const MessageId = {} as { ClassMethods: typeof ClassMethods };
MessageId.ClassMethods = ClassMethods;
extend(MessageId, Concern);
