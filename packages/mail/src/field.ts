import {
  byteslice,
  Encoding,
  forceEncoding,
  Range,
  rbInspect,
  rbObjAsString,
  rbObjDup,
  StandardError,
} from "@blazetrails/ruby-compat";

export class Field {
  static FieldError = class FieldError extends StandardError {};

  static ParseError = class ParseError extends Field.FieldError {
    element: unknown;
    value: unknown;
    reason: unknown;

    constructor(element: unknown, value: unknown, reason: unknown) {
      const value_ = new.target.prototype.toUtf8(value);
      const reason_ = new.target.prototype.toUtf8(reason);
      const [elementS, valueS, reasonS] = [element, value_, reason_].map((x) => {
        const str: unknown = rbObjAsString(x);
        return str instanceof Uint8Array ? new TextDecoder().decode(str) : str;
      });
      super(`${elementS} can not parse |${valueS}|: ${reasonS}`);
      this.element = element;
      this.value = value_;
      this.reason = reason_;
    }

    /** @internal */
    toUtf8(text: unknown): unknown {
      if (text instanceof Uint8Array || typeof text === "string") {
        return forceEncoding(rbObjDup(text), Encoding.UTF_8);
      } else {
        return text;
      }
    }
  };

  static NilParseError = class NilParseError extends Field.ParseError {
    constructor(element: unknown) {
      super(element, null, "nil is invalid");
    }
  };

  static IncompleteParseError = class IncompleteParseError extends Field.ParseError {
    constructor(element: unknown, originalText: Uint8Array, unparsedIndex: number) {
      const parsedText = forceEncoding(
        byteslice(originalText, new Range(0, unparsedIndex, true))!,
        Encoding.UTF_8,
      );
      super(element, originalText, `Only able to parse up to ${rbInspect(parsedText)}`);
    }
  };

  static SyntaxError = class SyntaxError extends Field.FieldError {};
}
