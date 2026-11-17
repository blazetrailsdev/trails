import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class NotificationComponent {
  renderIn(
    viewContext: { capture(block: () => unknown): unknown },
    block: () => unknown,
  ): SafeBuffer {
    return htmlSafe(`<div class='notification'>${viewContext.capture(block)}</div>`);
  }
}
constSet(TopLevel, "NotificationComponent", NotificationComponent);
