import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    MessageComponent?: typeof MessageComponent;
  }
}

export class MessageComponent {
  private text: unknown;

  constructor(text: unknown) {
    this.text = text;
  }

  renderIn(_viewContext: unknown): SafeBuffer {
    return htmlSafe(`<div class='test-message'>${this.text}</div>`);
  }

  format(): string {
    return ":html";
  }
}
TopLevel.MessageComponent = MessageComponent;
