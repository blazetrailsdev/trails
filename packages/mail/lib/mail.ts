import { Time } from "@blazetrails/date";
import {
  File,
  kernelRand,
  Process,
  rbObjAsString,
  rbObjId,
  rbStrToI,
  sprintf,
  Thread,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Configuration } from "./configuration.js";
import type { Message } from "./message.js";
import type { Part } from "./part.js";

export interface MailConstants {
  Message: typeof Message;
  Part: typeof Part;
  SMTP: typeof import("./network/delivery-methods/smtp.js").SMTP;
  Sendmail: typeof import("./network/delivery-methods/sendmail.js").Sendmail;
  Exim: typeof import("./network/delivery-methods/exim.js").Exim;
  FileDelivery: typeof import("./network/delivery-methods/file-delivery.js").FileDelivery;
  SMTPConnection: typeof import("./network/delivery-methods/smtp-connection.js").SMTPConnection;
  TestMailer: typeof import("./network/delivery-methods/test-mailer.js").TestMailer;
  LoggerDelivery: typeof import("./network/delivery-methods/logger-delivery.js").LoggerDelivery;
  Parsers?: typeof import("./parsers.js");
  YAML: typeof import("./yaml.js").YAML;
  CheckDeliveryParams: typeof import("./check-delivery-params.js").CheckDeliveryParams;
  Matchers?: typeof import("./matchers/attachment-matchers.js").Matchers;
  BccField: typeof import("./fields/bcc-field.js").BccField;
  CcField: typeof import("./fields/cc-field.js").CcField;
  CommentsField: typeof import("./fields/comments-field.js").CommentsField;
  ContentDescriptionField: typeof import("./fields/content-description-field.js").ContentDescriptionField;
  ContentDispositionField: typeof import("./fields/content-disposition-field.js").ContentDispositionField;
  ContentIdField: typeof import("./fields/content-id-field.js").ContentIdField;
  ContentLocationField: typeof import("./fields/content-location-field.js").ContentLocationField;
  ContentTransferEncodingField: typeof import("./fields/content-transfer-encoding-field.js").ContentTransferEncodingField;
  ContentTypeField: typeof import("./fields/content-type-field.js").ContentTypeField;
  DateField: typeof import("./fields/date-field.js").DateField;
  FromField: typeof import("./fields/from-field.js").FromField;
  InReplyToField: typeof import("./fields/in-reply-to-field.js").InReplyToField;
  KeywordsField: typeof import("./fields/keywords-field.js").KeywordsField;
  MessageIdField: typeof import("./fields/message-id-field.js").MessageIdField;
  MimeVersionField: typeof import("./fields/mime-version-field.js").MimeVersionField;
  OptionalField: typeof import("./fields/optional-field.js").OptionalField;
  ReceivedField: typeof import("./fields/received-field.js").ReceivedField;
  ReferencesField: typeof import("./fields/references-field.js").ReferencesField;
  ReplyToField: typeof import("./fields/reply-to-field.js").ReplyToField;
  ResentBccField: typeof import("./fields/resent-bcc-field.js").ResentBccField;
  ResentCcField: typeof import("./fields/resent-cc-field.js").ResentCcField;
  ResentDateField: typeof import("./fields/resent-date-field.js").ResentDateField;
  ResentFromField: typeof import("./fields/resent-from-field.js").ResentFromField;
  ResentMessageIdField: typeof import("./fields/resent-message-id-field.js").ResentMessageIdField;
  ResentSenderField: typeof import("./fields/resent-sender-field.js").ResentSenderField;
  ResentToField: typeof import("./fields/resent-to-field.js").ResentToField;
  ReturnPathField: typeof import("./fields/return-path-field.js").ReturnPathField;
  SenderField: typeof import("./fields/sender-field.js").SenderField;
  SubjectField: typeof import("./fields/subject-field.js").SubjectField;
  ToField: typeof import("./fields/to-field.js").ToField;
  UnstructuredField: typeof import("./fields/unstructured-field.js").UnstructuredField;
  "new"(...args: unknown[]): Message;
  read(filename: string): Promise<Message>;
  readFromString(mailAsString: string): Message;
  defaults(block: (this: Configuration) => unknown): unknown;
  deliveryMethod(): unknown;
  RANDOM_TAG: string;
  randomTag(): string;
  somethingRandom(): number | bigint;
  uniq(): number | bigint;
  registerObserver(observer: DeliveryObserver): void;
  unregisterObserver(observer: DeliveryObserver): void;
  registerInterceptor(interceptor: DeliveryInterceptor): void;
  unregisterInterceptor(interceptor: DeliveryInterceptor): void;
  informObservers(mail: Message): void;
  informInterceptors(mail: Message): void;
}

export interface DeliveryObserver {
  deliveredEmail(mail: Message): unknown;
}

export interface DeliveryInterceptor {
  deliveringEmail(mail: Message): unknown;
}

const deliveryNotificationObservers: DeliveryObserver[] = [];
const deliveryInterceptors: DeliveryInterceptor[] = [];

export const Mail: MailConstants = {
  RANDOM_TAG: "%x%x_%x%x%d%x",

  new(...args: unknown[]) {
    const block = typeof args.at(-1) === "function" ? args.pop() : undefined;
    return new Mail.Message(args, block);
  },

  defaults(block: (this: Configuration) => unknown) {
    return block.call(Configuration.instance());
  },

  deliveryMethod() {
    return Configuration.instance().deliveryMethod();
  },

  registerObserver(observer: DeliveryObserver) {
    if (!deliveryNotificationObservers.includes(observer)) {
      deliveryNotificationObservers.push(observer);
    }
  },

  unregisterObserver(observer: DeliveryObserver) {
    for (let i = deliveryNotificationObservers.indexOf(observer); i !== -1; ) {
      deliveryNotificationObservers.splice(i, 1);
      i = deliveryNotificationObservers.indexOf(observer);
    }
  },

  registerInterceptor(interceptor: DeliveryInterceptor) {
    if (!deliveryInterceptors.includes(interceptor)) {
      deliveryInterceptors.push(interceptor);
    }
  },

  unregisterInterceptor(interceptor: DeliveryInterceptor) {
    for (let i = deliveryInterceptors.indexOf(interceptor); i !== -1; ) {
      deliveryInterceptors.splice(i, 1);
      i = deliveryInterceptors.indexOf(interceptor);
    }
  },

  informObservers(mail: Message) {
    for (const observer of deliveryNotificationObservers) observer.deliveredEmail(mail);
  },

  informInterceptors(mail: Message) {
    for (const interceptor of deliveryInterceptors) interceptor.deliveringEmail(mail);
  },

  async read(filename: string): Promise<Message> {
    return Mail.new(await File.openAsync(filename, "rb", (f) => f.readAsync()));
  },

  readFromString(mailAsString: string): Message {
    return Mail.new(mailAsString);
  },

  randomTag(): string {
    const t = Time.now();
    return sprintf(
      Mail.RANDOM_TAG,
      t.toI(),
      t.usec,
      Process.pid,
      Math.abs(Number(rbObjId(Thread.current))),
      Mail.uniq(),
      kernelRand(255),
    );
  },

  /** @internal */
  somethingRandom(): number | bigint {
    const random = (Number(rbObjId(Thread.current)) * Number(kernelRand(255))) / Time.now().toF();
    return rbStrToI(rbObjAsString(random).slice(-3));
  },

  /** @internal */
  uniq(): number | bigint {
    return (_uniq = BigInt(_uniq) + 1n);
  },
} as unknown as MailConstants;

TopLevel.Mail = Mail;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Mail?: typeof Mail;
  }
}

let _uniq: number | bigint = Mail.somethingRandom();
