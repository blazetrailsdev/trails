import { isPresent } from "@blazetrails/activesupport";
import { chomp, stringSplit, strip } from "@blazetrails/ruby-compat";
import { ActionMailer } from "./namespaces.js";

interface MailHelperHost {
  _controller: { attachments: unknown } | null;
  _message: unknown;
  mailer(): { attachments: unknown } | null;
  formatParagraph(text: string, len?: number, indent?: number): string;
}

export const MailHelper = {
  blockFormat(this: MailHelperHost, text: string): string {
    const formatted = stringSplit(text, /\n\r?\n/)
      .map((paragraph) => this.formatParagraph(paragraph))
      .join("\n\n");

    let output = "";
    const splits = stringSplit(formatted, /(\*+|#+)/);
    let line: string | undefined;
    while ((line = splits.shift()) !== undefined) {
      if ((line.startsWith("*") || line.startsWith("#")) && splits[0]?.startsWith(" ")) {
        while (output.endsWith(" ")) output = chomp(output, " ");
        output += `  ${line} ${strip(splits.shift()!)}\n`;
      } else {
        output += line;
      }
    }

    return output;
  },

  mailer(this: MailHelperHost): { attachments: unknown } | null {
    return this._controller;
  },

  message(this: MailHelperHost): unknown {
    return this._message;
  },

  attachments(this: MailHelperHost): unknown {
    return this.mailer()!.attachments;
  },

  formatParagraph(this: MailHelperHost, text: string, len = 72, indent = 2): string {
    const sentences: string[][] = [[]];

    for (const word of stringSplit(text)) {
      if (isPresent(sentences[0]) && [...sentences.at(-1)!, word].join(" ").length > len) {
        sentences.push([word]);
      } else {
        sentences.at(-1)!.push(word);
      }
    }

    const indentation = " ".repeat(indent);
    return sentences.map((sentence) => `${indentation}${sentence.join(" ")}`).join("\n");
  },
};

ActionMailer.MailHelper = MailHelper;
