import { htmlEscape, SafeBuffer } from "@blazetrails/activesupport";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

export const ApplicationHelper = {
  /** Escapes a message body, links its URLs and keeps its line breaks. */
  formatMessage(
    this: { simpleFormat(text: unknown, htmlOptions?: object, options?: object): unknown },
    body: string,
  ): unknown {
    const linked = String(htmlEscape(body)).replace(
      URL_PATTERN,
      (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`,
    );
    return this.simpleFormat(new SafeBuffer(linked), {}, { sanitize: false });
  },
};
