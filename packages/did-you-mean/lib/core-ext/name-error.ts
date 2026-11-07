import { Exception, excToS, rbCallSuper, StandardError } from "@blazetrails/ruby-compat";
import { formatter } from "../did-you-mean.js";

interface CorrectableHost extends Error {
  readonly corrections: string[];
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

    let suggestion = formatter().messageFor(this.corrections);

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

export const Correctable = { originalMessage, detailedMessage };
