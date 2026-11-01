import { classAttribute } from "@blazetrails/activesupport";
import {
  Interrupt,
  STDOUT,
  rbObjMethod,
  rbObjRespondTo,
  type StringIO,
} from "@blazetrails/ruby-compat";
import { ENGINE_ROOT } from "../app-path.js";
import { Trails } from "../rails.js";

type Io = Pick<StringIO, "print" | "puts" | "write"> & { isTty?(): boolean };

interface Result {
  name: string;
  klass: string;
  time: number;
  failure: unknown;
  resultCode: string;
  sourceLocation: [string, number];
  isSkipped(): boolean;
  isPassed(): boolean;
}

type Options = Partial<Record<"verbose" | "outputInline" | "failFast" | "color", boolean>>;

const codes = { red: 31, green: 32, yellow: 33 };

export class TestUnitReporter {
  declare static appRoot: string | null | undefined;
  declare static executable: string;

  static {
    classAttribute.call(this, "appRoot", { instanceAccessor: false });
    classAttribute.call(this, "executable", { default: "bin/rails test" });
  }

  io: Io;
  options: Options;
  results: Result[] = [];
  declare executable: string;
  /** @internal */
  private _appRoot?: string | null;

  constructor(io: Io = STDOUT, options: Options = {}) {
    this.io = io;
    this.options = options;
  }

  prerecord(testClass: { name: string }, testName: string): void {
    if (this.options.verbose) {
      this.io.print(`${testClass.name}#${testName} = `);
    }
  }

  record(result: Result): void {
    if (!result.isPassed() || result.isSkipped()) this.results.push(result);

    if (this.options.verbose) {
      this.io.puts(this.colorOutput(this.formatLine(result), { by: result }));
    } else {
      this.io.print(this.colorOutput(result.resultCode, { by: result }));
    }

    if (this.isOutputInline() && result.failure && (!result.isSkipped() || this.options.verbose)) {
      this.io.puts();
      this.io.puts();
      this.io.puts(this.colorOutput(result, { by: result }));
      this.io.puts();
      this.io.puts(this.formatRerunSnippet(result));
      this.io.puts();
    }

    if (this.isFailFast() && result.failure && !result.isSkipped()) {
      throw new Interrupt();
    }
  }

  report(): void {
    if (this.isOutputInline() || this.filteredResults().length === 0) return;
    this.io.puts();
    this.io.puts("Failed tests:");
    this.io.puts();
    this.io.puts(this.aggregatedResults());
  }

  aggregatedResults(): string {
    return this.filteredResults()
      .map((result) => this.formatRerunSnippet(result))
      .join("\n");
  }

  filteredResults(): Result[] {
    if (this.options.verbose) {
      return this.results;
    } else {
      return this.results.filter((result) => !result.isSkipped());
    }
  }

  relativePathFor(file: string): string {
    const appRoot = this.appRoot();
    if (appRoot != null) {
      return file.replace(new RegExp(`^${appRoot}/?`), "");
    } else {
      return file;
    }
  }

  /** @internal */
  private isOutputInline(): boolean | undefined {
    return this.options.outputInline;
  }

  /** @internal */
  private isFailFast(): boolean | undefined {
    return this.options.failFast;
  }

  /** @internal */
  private formatLine(result: Result): string {
    return `${result.time.toFixed(2)} s = ${result.resultCode}`;
  }

  /** @internal */
  private formatRerunSnippet(result: Result): string {
    const [location, line] = rbObjRespondTo(result, "sourceLocation")
      ? result.sourceLocation
      : rbObjMethod(result, result.name).sourceLocation()!;

    return `${this.executable} ${this.relativePathFor(location)}:${line}`;
  }

  /** @internal */
  private appRoot(): string | null | undefined {
    return (this._appRoot ??=
      (this.constructor as typeof TestUnitReporter).appRoot ??
      ENGINE_ROOT ??
      Trails.root()?.toString());
  }

  /** @internal */
  private isColoredOutput(): boolean | undefined {
    return this.options.color && this.io.isTty !== undefined && this.io.isTty();
  }

  static readonly COLOR_BY_RESULT_CODE: Record<string, number> = {
    ".": codes.green,
    E: codes.red,
    F: codes.red,
    S: codes.yellow,
  };

  /** @internal */
  private colorOutput(string: unknown, { by }: { by: Result }): unknown {
    if (this.isColoredOutput()) {
      const code = TestUnitReporter.COLOR_BY_RESULT_CODE[by.resultCode];
      return `\x1b[${code}m${String(string)}\x1b[0m`;
    } else {
      return string;
    }
  }
}
