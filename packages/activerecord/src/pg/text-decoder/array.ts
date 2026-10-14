import { TypeError } from "@blazetrails/ruby-compat";
import { Coder } from "../coder.js";
import { CompositeDecoder } from "../composite-decoder.js";

type DecFunc = (word: string, tuple: number, field: number) => unknown;

function arrayIsspace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\v" || ch === "\f";
}

function arrayIsdim(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= "0" && ch <= "9") || ch === "-" || ch === "+" || ch === ":");
}

function arrayParserError(self: Array, text: string): void {
  if ((self.flags & Coder.FORMAT_ERROR_MASK) === Coder.FORMAT_ERROR_TO_RAISE) {
    throw new TypeError(text);
  }
}

function readArrayWithoutDim(
  self: Array,
  index: { value: number },
  cPgArrayString: string,
  tuple: number,
  field: number,
  decFunc: DecFunc,
): unknown[] {
  const array: unknown[] = [];
  let word = "";
  let openQuote = 0;
  let escapeNext = false;

  if (index.value < cPgArrayString.length && cPgArrayString[index.value] === "}") {
    return array;
  }

  for (; index.value < cPgArrayString.length; ++index.value) {
    const c = cPgArrayString[index.value];
    if (openQuote < 1) {
      if (c === self.delimiter || c === "}") {
        if (!escapeNext) {
          if (openQuote === 0 && word === "NULL") {
            array.push(null);
          } else {
            array.push(decFunc(word, tuple, field));
          }
        }
        if (c === "}") {
          return array;
        }
        escapeNext = false;
        openQuote = 0;
        word = "";
      } else if (c === '"') {
        openQuote = 1;
      } else if (c === "{") {
        index.value++;
        array.push(readArrayWithoutDim(self, index, cPgArrayString, tuple, field, decFunc));
        escapeNext = true;
      } else if (c === "\0") {
        arrayParserError(self, "premature end of the array string");
        return array;
      } else {
        word += c;
      }
    } else if (escapeNext) {
      word += c;
      escapeNext = false;
    } else if (c === "\\") {
      escapeNext = true;
    } else if (c === '"') {
      openQuote = -1;
    } else {
      word += c;
    }
  }

  arrayParserError(self, "premature end of the array string");
  return array;
}

export class Array extends CompositeDecoder {
  decode(string: string | null, tuple: number | null = null, field: number | null = null) {
    if (string == null) return null;
    const index = { value: 0 };
    let ndim = 0;
    let ret: unknown[];

    for (;;) {
      while (arrayIsspace(string[index.value])) index.value++;
      if (string[index.value] !== "[") break;
      index.value++;

      while (arrayIsdim(string[index.value])) index.value++;

      if (string[index.value] !== "]") {
        arrayParserError(this, 'missing "]" in array dimensions');
        break;
      }
      index.value++;

      ndim++;
    }

    if (ndim !== 0) {
      if (string[index.value] !== "=") {
        arrayParserError(this, "missing assignment operator");
        index.value -= 2;
      }
      index.value++;

      while (arrayIsspace(string[index.value])) index.value++;
    }

    if (string[index.value] !== "{") {
      arrayParserError(this, 'array value must start with "{" or dimension information');
    }
    index.value++;

    if (index.value < string.length && string[index.value] === "}") {
      ret = [];
    } else {
      const elem = this.elementsType as { decode: DecFunc } | null;
      const decFunc: DecFunc = elem ? (word, t, f) => elem.decode(word, t, f) : (word) => word;
      ret = readArrayWithoutDim(this, index, string, tuple ?? -1, field ?? -1, decFunc);
    }

    if (string[index.value] !== "}") {
      arrayParserError(this, 'array value must end with "}"');
    }
    index.value++;

    for (; index.value < string.length; ++index.value) {
      if (!arrayIsspace(string[index.value])) {
        arrayParserError(this, "malformed array literal: Junk after closing right brace.");
      }
    }

    return ret;
  }
}
