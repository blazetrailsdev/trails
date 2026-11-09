import { StandardError } from "@blazetrails/ruby-compat";

export class EncodingError extends StandardError {
  static toString(): string {
    return "Mail::Multibyte::EncodingError";
  }
}
