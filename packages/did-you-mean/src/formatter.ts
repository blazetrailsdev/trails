export class Formatter {
  static messageFor(corrections: string[]): string {
    return corrections.length === 0
      ? ""
      : `\nDid you mean?  ${corrections.join("\n               ")}`;
  }

  messageFor(corrections: string[]): string {
    console.warn(
      "The instance method #message_for has been deprecated. Please use the class method " +
        "DidYouMean::Formatter.message_for(...) instead.",
    );

    return (this.constructor as typeof Formatter).messageFor(corrections);
  }
}
