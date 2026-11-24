import type { SafeBuffer } from "@blazetrails/activesupport";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const InvitationsHelper = {
  buttonToCopyToClipboard(this: ViewHost, url: string, block?: () => unknown): SafeBuffer {
    return this.tag().button(
      {
        class: "btn",
        data: {
          controller: "copy-to-clipboard",
          action: "copy-to-clipboard#copy",
          copyToClipboardSuccessClass: "btn--success",
          copyToClipboardContentValue: url,
        },
      },
      block,
    );
  },

  webShareButton(
    this: ViewHost,
    url: string,
    title: string,
    text: string,
    block?: () => unknown,
  ): SafeBuffer {
    return this.tag().button(
      {
        class: "btn",
        hidden: true,
        data: {
          controller: "web-share",
          action: "web-share#share",
          webShareUrlValue: url,
          webShareTextValue: text,
          webShareTitleValue: title,
        },
      },
      block,
    );
  },
};
