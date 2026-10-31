import {
  chomp,
  env,
  File,
  Hash,
  isSymbol,
  matchOperator,
  NotImplementedError,
  Open3,
  print,
  puts,
  rbConstGet,
  rbEnsure,
  rbEqual,
  rbFSystem,
  rbObjAsString as toS,
  rtest,
  stderr as $stderr,
  stdout as $stdout,
  strip,
  symbolToS,
  SystemExit,
  Tempfile,
  type StdStream,
  uniq,
  rbObjIsKindOf,
} from "@blazetrails/ruby-compat";
import * as LineEditor from "../line-editor.js";
import { ColumnPrinter, type ColumnPrinterOptions } from "./column-printer.js";
import { TablePrinter } from "./table-printer.js";
import { WrappedPrinter } from "./wrapped-printer.js";
import * as Terminal from "./terminal.js";

export class Basic {
  base: { options: Record<string, unknown> } | null;
  /** @internal */
  protected _mute: boolean;
  /** @internal */
  protected _padding: number;
  /** @internal */
  protected _alwaysForce: boolean;
  /** @internal */
  protected _mergeTool?: string;

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
    const options = (rbObjIsKindOf(last, Hash) ? args.pop() : {}) as Record<string, unknown>;
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
    return rtest(
      matchOperator(await this.ask(statement, color, { addToHistory: false }), this.is("yes")),
    );
  }

  async isNo(statement: unknown, color: unknown = null): Promise<boolean> {
    return rtest(
      matchOperator(await this.ask(statement, color, { addToHistory: false }), this.is("no")),
    );
  }

  async fileCollision(destination: string, block?: () => unknown): Promise<boolean | null> {
    if (this._alwaysForce) return true;
    const options = block ? "[Ynaqdhm]" : "[Ynaqh]";

    for (;;) {
      const answer = await this.ask(`Overwrite ${destination}? (enter "h" for help) ${options}`, {
        addToHistory: false,
      });

      if (answer == null) {
        this.say("");
        return true;
      } else if (
        rtest(matchOperator(answer, this.is("yes"))) ||
        rtest(matchOperator(answer, this.is("force"))) ||
        answer === ""
      ) {
        return true;
      } else if (
        rtest(matchOperator(answer, this.is("no"))) ||
        rtest(matchOperator(answer, this.is("skip")))
      ) {
        return false;
      } else if (rtest(matchOperator(answer, this.is("always")))) {
        return (this._alwaysForce = true);
      } else if (rtest(matchOperator(answer, this.is("quit")))) {
        this.say("Aborting...");
        throw new SystemExit(0);
      } else if (rtest(matchOperator(answer, this.is("diff")))) {
        if (block) await this.showDiff(destination, await block());
        this.say("Retrying...");
      } else if (rtest(matchOperator(answer, this.is("merge")))) {
        if (block && (await this.mergeTool()).length !== 0) {
          await this.merge(destination, await block());
          return null;
        }

        this.say("Please specify merge tool to `THOR_MERGE` env.");
      } else {
        this.say(this.fileCollisionHelp(block !== undefined));
      }
    }
  }

  printInColumns(array: unknown[]): void {
    const printer = new ColumnPrinter(this.stdout());
    printer.print(array);
  }

  printTable(array: unknown[], options: ColumnPrinterOptions = {}): void {
    const printer = new TablePrinter(this.stdout(), options);
    printer.print(array);
  }

  printWrapped(message: string, options: ColumnPrinterOptions = {}): void {
    const printer = new WrappedPrinter(this.stdout(), options);
    printer.print(message);
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

    if ([...(value as string)].length === 1) {
      return new RegExp(`^${value}$`, "i");
    } else {
      return new RegExp(`^(${value}|${[...(value as string)].slice(0, 1).join("")})$`, "i");
    }
  }

  /** @internal */
  protected fileCollisionHelp(blockGiven: boolean): string {
    let help = `        Y - yes, overwrite
        n - no, do not overwrite
        a - all, overwrite this and all others
        q - quit, abort
        h - help, show this help
`;
    if (blockGiven) {
      help += `        d - diff, show the differences between the old and the new
        m - merge, run merge tool
`;
    }
    return help;
  }

  /** @internal */
  protected async showDiff(destination: string, content: unknown): Promise<void> {
    const diffCmd = env["THOR_DIFF"] ?? env["RAILS_DIFF"] ?? "diff -u";

    await Tempfile.open(File.basename(destination), File.dirname(destination), async (temp) => {
      temp.write(content as string | Uint8Array);
      temp.rewind();
      await rbFSystem(`${diffCmd} "${destination}" "${temp.path()}"`);
    });
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

    result = strip(result);

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
    const caseInsensitive = Object.hasOwn(options, "caseInsensitive")
      ? options.caseInsensitive
      : false;
    let correctAnswer: unknown = null;
    while (!rtest(correctAnswer)) {
      const answers = answerSet.flat(Infinity).join(", ");
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

  /** @internal */
  protected async merge(destination: string, content: unknown): Promise<void> {
    await Tempfile.open(
      [File.basename(destination), File.extname(destination)],
      File.dirname(destination),
      async (temp) => {
        temp.write(content as string | Uint8Array);
        temp.rewind();
        await rbFSystem(`${await this.mergeTool()} "${temp.path()}" "${destination}"`);
      },
    );
  }

  /** @internal */
  protected async mergeTool(): Promise<string> {
    return (this._mergeTool ??= env["THOR_MERGE"] ?? (await this.gitMergeTool()));
  }

  /** @internal */
  protected async gitMergeTool(): Promise<string> {
    try {
      return toS((await Open3.capture3("git config merge.tool"))[0]).trimEnd();
    } catch (e) {
      if (e instanceof NotImplementedError) throw e;
      return "";
    }
  }
}
