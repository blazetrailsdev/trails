import {
  chomp,
  fetch,
  Hash,
  isSymbol,
  print,
  puts,
  rbConstGet,
  rbEnsure,
  rbEqual,
  rbObjAsString as toS,
  rbObjClass,
  rbStrMatch,
  rtest,
  stderr as $stderr,
  stdout as $stdout,
  symbolToS,
  type StdStream,
  uniq,
} from "@blazetrails/ruby-compat";
import * as LineEditor from "../line-editor.js";
import * as Terminal from "./terminal.js";

export class Basic {
  base: { options: Record<string, unknown> } | null;
  /** @internal */
  protected _mute: boolean;
  /** @internal */
  protected _padding: number;
  /** @internal */
  protected _alwaysForce: boolean;

  get padding(): number {
    return this._padding;
  }

  constructor() {
    this.base = null;
    this._mute = false;
    this._padding = 0;
    this._alwaysForce = false;
  }

  mute<T>(block: () => T): T {
    this._mute = true;
    return rbEnsure(block, () => {
      this._mute = false;
    });
  }

  isMute(): boolean {
    return this._mute;
  }

  set padding(value: number) {
    this._padding = Math.max(0, value);
  }

  indent<T>(count: number = 1, block: () => T): T {
    const origPadding = this.padding;
    this.padding = this.padding + count;
    const result = block();
    if (result instanceof Promise) {
      return result.then((value: unknown) => {
        this.padding = origPadding;
        return value;
      }) as T;
    }
    this.padding = origPadding;
    return result;
  }

  ask(statement: unknown, ...args: unknown[]): Promise<unknown> {
    const last = args.at(-1);
    const options = (
      rbObjClass(last) === "Hash" || last instanceof Hash ? args.pop() : {}
    ) as Record<string, unknown>;
    const color = args[0] ?? null;

    if (rtest(options.limitedTo)) {
      return this.askFiltered(statement, color, options);
    } else {
      return this.askSimply(statement, color, options);
    }
  }

  say(message: unknown = "", color: unknown = null, forceNewLine?: unknown): void {
    if (arguments.length < 3) forceNewLine = !/( |\t)(?=\n?$)/.test(toS(message));
    if (rtest(this.isQuiet())) return;

    let buffer = this.prepareMessage(
      message,
      ...(color == null ? [] : Array.isArray(color) ? color : [color]),
    );
    if (rtest(forceNewLine) && !toS(message).endsWith("\n")) buffer += "\n";

    print.call(this.stdout(), buffer);
    this.stdout().flush();
  }

  sayError(message: unknown = "", color: unknown = null, forceNewLine?: unknown): void {
    if (arguments.length < 3) forceNewLine = !/( |\t)(?=\n?$)/.test(toS(message));
    if (rtest(this.isQuiet())) return;

    let buffer = this.prepareMessage(
      message,
      ...(color == null ? [] : Array.isArray(color) ? color : [color]),
    );
    if (rtest(forceNewLine) && !toS(message).endsWith("\n")) buffer += "\n";

    print.call(this.stderr(), buffer);
    this.stderr().flush();
  }

  /** @missingRailsArgs chomp — PERMANENT */
  sayStatus(status: unknown, message: unknown, logStatus: unknown = true): void {
    if (rtest(this.isQuiet()) || logStatus === false) return;
    const spaces = "  ".repeat(this.padding + 1);
    status = toS(status).padStart(12);
    const margin = " ".repeat((status as string).length) + spaces;

    const color = isSymbol(logStatus) ? logStatus : ":green";
    if (color) status = this.setColor(status as string, color, true);

    message = chomp(toS(message)).replace(/(?<=\n)(?!$)/g, margin);
    const buffer = `${status}${spaces}${message}\n`;

    print.call(this.stdout(), buffer);
    this.stdout().flush();
  }

  async isYes(statement: unknown, color: unknown = null): Promise<boolean> {
    const answer = await this.ask(statement, color, { addToHistory: false });
    return answer != null && rbStrMatch(answer as string, this.is("yes")) != null;
  }

  async isNo(statement: unknown, color: unknown = null): Promise<boolean> {
    const answer = await this.ask(statement, color, { addToHistory: false });
    return answer != null && rbStrMatch(answer as string, this.is("no")) != null;
  }

  error(statement: unknown): void {
    puts.call(this.stderr(), statement);
  }

  setColor(string: string, ..._: unknown[]): string {
    return string;
  }

  /** @internal */
  protected prepareMessage(message: unknown, ...color: unknown[]): string {
    const spaces = "  ".repeat(this.padding);
    return spaces + this.setColor(toS(message), ...color);
  }

  /** @internal */
  protected canDisplayColors(): boolean {
    return false;
  }

  /** @internal */
  protected lookupColor(color: unknown): unknown {
    if (!isSymbol(color)) return color;
    return rbConstGet(this.constructor, symbolToS(color).toUpperCase());
  }

  /** @internal */
  protected stdout(): StdStream {
    return $stdout;
  }

  /** @internal */
  protected stderr(): StdStream {
    return $stderr;
  }

  /** @internal */
  protected is(value: unknown): RegExp {
    value = toS(value);

    if ((value as string).length === 1) {
      return new RegExp(`^${value}$`, "i");
    } else {
      return new RegExp(`^(${value}|${(value as string).slice(0, 1)})$`, "i");
    }
  }

  /** @internal */
  protected isQuiet(): unknown {
    return this.isMute() || (this.base && this.base.options["quiet"]);
  }

  /** @internal */
  protected isUnix(): boolean {
    return Terminal.isUnix();
  }

  /** @internal */
  protected async askSimply(
    statement: unknown,
    color: unknown,
    options: Record<string, unknown>,
  ): Promise<unknown> {
    const default_ = options.default;
    let message = uniq([statement, rtest(default_) ? `(${toS(default_)})` : null, null]).join(" ");
    message = this.prepareMessage(
      message,
      ...(color == null ? [] : Array.isArray(color) ? color : [color]),
    );
    let result = await LineEditor.readline(message, options);

    if (result == null) return null;

    result = result.trim();

    if (rtest(default_) && result === "") {
      return default_;
    } else {
      return result;
    }
  }

  /** @internal */
  protected async askFiltered(
    statement: unknown,
    color: unknown,
    options: Record<string, unknown>,
  ): Promise<unknown> {
    const answerSet = options.limitedTo as unknown[];
    const caseInsensitive = fetch(options, "caseInsensitive", false);
    let correctAnswer: unknown = null;
    while (!rtest(correctAnswer)) {
      const answers = answerSet.join(", ");
      const answer = await this.askSimply(`${toS(statement)} [${answers}]`, color, options);
      correctAnswer = this.answerMatch(answerSet, answer, caseInsensitive);
      if (!rtest(correctAnswer)) {
        this.say(`Your response must be one of: [${answers}]. Please try again.`);
      }
    }
    return correctAnswer;
  }

  /** @internal */
  protected answerMatch(
    possibilities: unknown[],
    answer: unknown,
    caseInsensitive: unknown,
  ): unknown {
    if (rtest(caseInsensitive)) {
      return (
        possibilities.find(
          (possibility) =>
            (possibility as string).toLowerCase() === (answer as string).toLowerCase(),
        ) ?? null
      );
    } else {
      return possibilities.find((possibility) => rbEqual(possibility, answer)) ?? null;
    }
  }
}
