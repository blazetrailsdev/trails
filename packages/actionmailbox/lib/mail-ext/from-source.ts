import { Mail, Utilities, type Message } from "@blazetrails/mail";
import { rbObjAsString } from "@blazetrails/ruby-compat";

declare module "@blazetrails/mail/mail" {
  interface MailConstants {
    fromSource(source: unknown): Message;
  }
}

export function fromSource(source: unknown): Message {
  return Mail.new(Utilities.binaryUnsafeToCrlf(rbObjAsString(source)));
}

Mail.fromSource = fromSource;
