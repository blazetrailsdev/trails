import {
  File,
  RUBY_VERSION,
  RuntimeError,
  SignalException,
  block,
  env as ENV,
  isPlainHash,
  rbArgv,
  rbFArray,
  rbBlockGivenP,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import type { main } from "./dsl-definition.js";
import { FileList } from "./file-list.js";
import { FileUtilsExt } from "./file-utils-ext.js";
import type { FileUtils } from "./file-utils.js";
import { Rake } from "./rake-module.js";
import { TaskLib } from "./tasklib.js";

type RunStatus = {
  exitstatus(): number | null;
  isSignaled?(): boolean;
  termsig?(): string | null;
};

export class TestTask extends TaskLib {
  name: unknown;
  libs: string[] = ["lib"];
  verbose = false;
  options: string | null = null;
  warning = true;
  pattern: string | null = null;
  loader = "rake";
  rubyOpts: string[] = [];
  description: string;
  deps: unknown = [];
  /** @internal */ _testFiles: string[] | FileList | null = null;

  set testFiles(list: string[] | FileList) {
    this._testFiles = list;
  }

  constructor(name: unknown = "test", ...args: unknown[]) {
    super();
    this.name = name;
    this.description = "Run tests" + (this.name === "test" ? "" : ` for ${String(this.name)}`);
    if (isPlainHash(this.name)) {
      this.deps = Object.values(this.name)[0];
      this.name = Object.keys(this.name)[0];
    }
    if (rbBlockGivenP(args.at(-1))) (args.at(-1) as (t: TestTask) => unknown)(this);
    if (this.pattern == null && this._testFiles == null) this.pattern = "test/test*.rb";
    this.define();
  }

  define(): this {
    const self = this as unknown as typeof main & typeof FileUtils;
    self.desc(this.description);
    self.task(
      { [this.name as string]: rbFArray(this.deps) },
      block(() =>
        FileUtilsExt.verbose(this.verbose, async () => {
          if (rbArgv().includes("--verbose")) {
            console.log('Use TESTOPTS="--verbose" to pass --verbose, etc. to runners.');
          }
          const args =
            `${this.rubyOptsString()} ${this.runCode()} ` +
            `${await this.fileListString()} ${this.optionList()}`;
          await self.ruby(
            args,
            block((ok: unknown, status: RunStatus) => {
              if (!ok && rbObjRespondTo(status, "isSignaled") && status.isSignaled!()) {
                throw new SignalException(status.termsig!()!);
              } else if (!ok) {
                const statusMessage = `Command failed with status (${status.exitstatus()})`;
                const details = `: [ruby ${args}]`;
                const message =
                  Rake.application!.options.trace || this.verbose
                    ? statusMessage + details
                    : statusMessage;

                throw new RuntimeError(message);
              }
            }),
          );
        }),
      ),
    );
    return this;
  }

  /** @internal */
  optionList(): string {
    return (
      ENV["TESTOPTS"] || ENV["TESTOPT"] || ENV["TEST_OPTS"] || ENV["TEST_OPT"] || this.options || ""
    );
  }

  /** @internal */
  rubyOptsString(): string {
    const opts = [...this.rubyOpts];
    if (this.warning) opts.unshift("--pending-deprecation");
    return opts.join(" ");
  }

  /** @internal */
  libPath(): string {
    return this.libs.join(File.PATH_SEPARATOR);
  }

  /** @internal */
  async fileListString(): Promise<string> {
    return (await this.fileList()).map((fn: string) => `"${fn}"`).join(" ");
  }

  /** @internal */
  async fileList(): Promise<string[]> {
    if (ENV["TEST"]) {
      return (await FileList.get(ENV["TEST"]).toA()) as string[];
    } else {
      let result: string[] = [];
      if (this._testFiles != null) {
        const testFiles = this._testFiles;
        result = result.concat(
          Array.isArray(testFiles) ? testFiles : ((await testFiles.toA()) as string[]),
        );
      }
      if (this.pattern != null) {
        result = result.concat((await FileList.get(this.pattern).toA()) as string[]);
      }
      return result;
    }
  }

  /** @internal */
  rubyVersion(): string {
    return RUBY_VERSION;
  }

  /** @internal */
  runCode(): string | undefined {
    switch (this.loader) {
      case "direct":
        return `-e "process.argv.slice(1).forEach((f) => require(require('path').resolve(f)))"`;
      case "testrb":
        return "-S testrb";
      case "rake":
        return `${File.dirname(decodeURIComponent(new URL(import.meta.url).pathname))}/rake-test-loader.js`;
    }
  }
}
