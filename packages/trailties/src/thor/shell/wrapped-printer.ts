import { compact, puts, stringSplit, strlen } from "@blazetrails/ruby-compat";
import { ColumnPrinter } from "./column-printer.js";
import * as Terminal from "./terminal.js";

export class WrappedPrinter extends ColumnPrinter {
  override print(message: unknown[] | string): void {
    const width = Terminal.terminalWidth() - this._indent;
    let paras = stringSplit(message as string, "\n\n");

    paras = compact(
      paras.map((unwrapped) => {
        const words = stringSplit(unwrapped, " ");
        let counter = strlen(words[0]);
        return words.reduce((memo, word) => {
          word = word.replaceAll("\n\x05", "\n").replaceAll("\x05", "\n");
          if (word.includes("\n")) counter = 0;
          if (counter + strlen(word) + 1 < width) {
            memo = `${memo} ${word}`;
            counter += strlen(word) + 1;
          } else {
            memo = `${memo}\n${word}`;
            counter = strlen(word);
          }
          return memo;
        });
      }),
    );

    paras.forEach((para) => {
      stringSplit(para, "\n").forEach((line) => {
        puts.call(this.stdout, " ".repeat(this._indent) + line);
      });
      if (para !== paras.at(-1)) puts.call(this.stdout);
    });
  }
}
