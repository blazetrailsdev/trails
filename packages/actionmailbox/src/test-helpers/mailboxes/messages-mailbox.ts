import { TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationMailbox } from "./application-mailbox.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    MessagesMailbox?: typeof MessagesMailbox;
  }
}

export class MessagesMailbox extends ApplicationMailbox {
  process(): void {}
}

TopLevel.MessagesMailbox = MessagesMailbox;
