import { Exception } from "@blazetrails/ruby-compat/exception";
import { excToS } from "@blazetrails/ruby-compat/exc-to-s";
import { hashAref } from "@blazetrails/ruby-compat/hash";
import { rbCallSuper } from "@blazetrails/ruby-compat/include";
import { toS, TopLevel } from "@blazetrails/ruby-compat/object";
import { StandardError } from "@blazetrails/ruby-compat/standard-error";

interface CorrectableHost extends Error {
  readonly corrections: string[];
  _corrections?: string[];
  spellChecker(): { readonly corrections: string[] };
}

function originalMessage(this: CorrectableHost): string {
  return excToS(this);
}

function detailedMessage(
  this: CorrectableHost,
  {
    highlight = true,
    didYouMean = true,
    ...rest
  }: { highlight?: boolean; didYouMean?: boolean } & Record<string, unknown> = {},
): string {
  const zsuper = (): string =>
    rbCallSuper(this, detailedMessage, { highlight, didYouMean, ...rest }) as string;
  try {
    let msg = zsuper();

    if (!didYouMean) return msg;

    let suggestion = TopLevel.DidYouMean!.formatter().messageFor(this.corrections);

    if (highlight) {
      suggestion = suggestion.replace(/.+/g, (match) => "\x1b[1m" + match + "\x1b[m");
    }

    msg += suggestion;
    return msg;
  } catch (error) {
    if (error instanceof Exception && !(error instanceof StandardError)) throw error;
    return zsuper();
  }
}

export const Correctable = {
  originalMessage,
  detailedMessage,
  get corrections(): string[] {
    const self = this as unknown as CorrectableHost;
    return (self._corrections ??= self.spellChecker().corrections);
  },
  spellChecker(this: CorrectableHost): { readonly corrections: string[] } {
    const checker = hashAref(TopLevel.DidYouMean!.spellCheckers(), toS(this.constructor)) as new (
      exception: CorrectableHost,
    ) => { readonly corrections: string[] };
    return new checker(this);
  },
};
