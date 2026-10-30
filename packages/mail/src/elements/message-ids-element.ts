import { MessageIdsParser } from "../parsers/message-ids-parser.js";
import { Utilities } from "../utilities.js";

export class MessageIdsElement {
  static parse(string: string | null): MessageIdsElement {
    return new this(string);
  }

  messageIds: string[];

  constructor(string: string | null) {
    this.messageIds = this.parse(string);
  }

  get messageId(): string | null {
    return this.messageIds[0] ?? null;
  }

  /** @internal */
  private parse(string: string | null): string[] {
    if (Utilities.isBlank(string)) {
      return [];
    } else {
      return MessageIdsParser.parse(string).messageIds;
    }
  }
}
