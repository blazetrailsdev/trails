import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    NotificationComponent?: typeof NotificationComponent;
  }
}

export class NotificationComponent {
  renderIn(
    viewContext: { capture(block: () => unknown): unknown },
    block: () => unknown,
  ): SafeBuffer {
    return htmlSafe(`<div class='notification'>${viewContext.capture(block)}</div>`);
  }
}
TopLevel.NotificationComponent = NotificationComponent;
