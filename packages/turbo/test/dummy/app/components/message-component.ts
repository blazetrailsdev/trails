import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class MessageComponent {
  private text: unknown;

  constructor(text: unknown) {
    this.text = text;
  }

  renderIn(_viewContext: unknown): SafeBuffer {
    return htmlSafe(`<div class='test-message'>${this.text}</div>`);
  }

  format(): string {
    return "html";
  }
}
constSet(TopLevel, "MessageComponent", MessageComponent);
