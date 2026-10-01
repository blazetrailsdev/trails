import { formatter, SpellChecker as DidYouMeanSpellChecker } from "@blazetrails/did-you-mean";
import { prepend, rbInspect, StandardError } from "@blazetrails/ruby-compat";

interface Corrected {
  _corrections?: string[];
  corrections(): string[];
}

export const Correctable = {
  toString(this: Corrected, super_: () => unknown): string {
    return (super_() as string) + formatter().messageFor(this.corrections());
  },

  corrections(this: Corrected): string[] {
    const { SpellChecker } = this.constructor as unknown as {
      SpellChecker: new (error: unknown) => { corrections(): string[] };
    };
    return (this._corrections ??= new SpellChecker(this).corrections());
  },
};

export class Error extends StandardError {
  #mesg: string;

  /** @noRailsEquivalent CONVERGEABLE ruby-compat-exception-message-dispatches-to-to-s */
  constructor(message?: string) {
    super(message);
    this.#mesg = this.message;
    delete (this as { message?: string }).message;
  }

  /** @noRailsEquivalent CONVERGEABLE ruby-compat-exception-message-dispatches-to-to-s */
  override get message(): string {
    return this.toString();
  }

  /** @noRailsEquivalent CONVERGEABLE ruby-compat-exception-message-dispatches-to-to-s */
  override toString(): string {
    return this.#mesg;
  }
}

export class UndefinedCommandError extends Error {
  readonly command: string;
  readonly allCommands: string[];
  declare corrections: () => string[];

  constructor(command: string, allCommands: string[], namespace: string | null) {
    let message = `Could not find command ${rbInspect(command)}`;
    message =
      namespace != null ? `${message} in ${rbInspect(namespace)} namespace.` : `${message}.`;

    super(message);
    this.command = command;
    this.allCommands = allCommands;
  }
}
// eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby nests `class SpellChecker` inside `class UndefinedCommandError` (`error.rb:25-39`), and two same-named nested classes in one file need the class's own namespace.
export namespace UndefinedCommandError {
  export class SpellChecker {
    readonly error: UndefinedCommandError;
    /** @internal */
    private _corrections?: string[];

    constructor(error: UndefinedCommandError) {
      this.error = error;
    }

    corrections(): string[] {
      return (this._corrections ??= this.spellChecker()
        .correct(this.error.command)
        .map((correction) => rbInspect(correction)));
    }

    spellChecker(): DidYouMeanSpellChecker {
      return new DidYouMeanSpellChecker({ dictionary: this.error.allCommands });
    }
  }
}
prepend(UndefinedCommandError.prototype, Correctable);
export const UndefinedTaskError = UndefinedCommandError;

export class AmbiguousCommandError extends Error {}
export const AmbiguousTaskError = AmbiguousCommandError;

export class InvocationError extends Error {}

export class UnknownArgumentError extends Error {
  readonly switches: string[];
  readonly unknown: string[];
  declare corrections: () => string[];

  constructor(switches: string[], unknown: string[]) {
    super(`Unknown switches ${unknown.map((u) => rbInspect(u)).join(", ")}`);
    this.switches = switches;
    this.unknown = unknown;
  }
}
// eslint-disable-next-line @typescript-eslint/no-namespace -- Ruby nests `class SpellChecker` inside `class UnknownArgumentError` (`error.rb:66-81`), and two same-named nested classes in one file need the class's own namespace.
export namespace UnknownArgumentError {
  export class SpellChecker {
    readonly error: UnknownArgumentError;
    /** @internal */
    private _corrections?: string[];
    /** @internal */
    private _spellChecker?: DidYouMeanSpellChecker;

    constructor(error: UnknownArgumentError) {
      this.error = error;
    }

    corrections(): string[] {
      return (this._corrections ??= [
        ...new Set(this.error.unknown.flatMap((unknown) => this.spellChecker().correct(unknown))),
      ].map((correction) => rbInspect(correction)));
    }

    spellChecker(): DidYouMeanSpellChecker {
      return (this._spellChecker ??= new DidYouMeanSpellChecker({
        dictionary: this.error.switches,
      }));
    }
  }
}
prepend(UnknownArgumentError.prototype, Correctable);

export class RequiredArgumentMissingError extends InvocationError {}

export class MalformattedArgumentError extends InvocationError {}

export class ExclusiveArgumentError extends InvocationError {}

export class AtLeastOneRequiredArgumentError extends InvocationError {}
