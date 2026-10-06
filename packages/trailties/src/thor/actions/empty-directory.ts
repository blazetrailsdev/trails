import {
  Errno,
  FileUtils,
  File,
  getFs,
  merge,
  rbFSend,
  rbObjRespondTo,
  rtest,
  strip,
  toS,
} from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";

export type EmptyDirectoryBase = Pick<
  ActionsHost,
  "options" | "shell" | "destinationRoot" | "relativeToOriginalDestinationRoot"
>;

type Block = () => unknown;

export function emptyDirectory(
  this: ActionsHost,
  destination: string,
  config: Record<string, unknown> = {},
): unknown {
  return this.action(new EmptyDirectory(this, destination, config));
}

export class EmptyDirectory {
  base: EmptyDirectoryBase;
  givenDestination!: string;
  relativeDestination!: string;
  config: Record<string, unknown>;
  /** @internal */
  private _destination!: string;

  constructor(
    base: EmptyDirectoryBase,
    destination: string | null | undefined,
    config: Record<string, unknown> = {},
  ) {
    this.base = base;
    this.config = merge({ verbose: true }, config);
    this.destination = destination;
  }

  get destination(): string {
    return this._destination;
  }

  isExists(): Promise<boolean> {
    return getFs().exists(this.destination);
  }

  invokeBang(): Promise<unknown> {
    return this.invokeWithConflictCheck(async () => {
      await FileUtils.mkdirPAsync(this.destination);
    });
  }

  async revokeBang(): Promise<unknown> {
    this.sayStatus("remove", ":red");
    if (!rtest(this.isPretend()) && (await this.isExists())) {
      await FileUtils.rmRfAsync(this.destination);
    }
    return this.givenDestination;
  }

  /** @internal */
  protected isPretend(): unknown {
    return this.base.options["pretend"];
  }

  /** @internal */
  protected set destination(destination: string | null | undefined) {
    if (!rtest(destination)) return;
    this.givenDestination = this.convertEncodedInstructions(toS(destination));
    this._destination = File.expandPath(this.givenDestination, this.base.destinationRoot);
    this.relativeDestination = this.base.relativeToOriginalDestinationRoot(this._destination);
  }

  /** @internal */
  protected convertEncodedInstructions(filename: string): string {
    return filename.replace(/%(.*?)%/g, (initialString: string, $1: string) => {
      const method = strip($1);
      return rbObjRespondTo(this.base, method, true)
        ? toS(rbFSend(this.base, method))
        : initialString;
    });
  }

  /** @internal */
  protected async invokeWithConflictCheck(block: Block): Promise<unknown> {
    try {
      if (await this.isExists()) {
        await this.onConflictBehavior(block);
      } else {
        if (!rtest(this.isPretend())) await block();
        this.sayStatus("create", ":green");
      }

      return this.destination;
    } catch (error) {
      if (error instanceof Errno.EISDIR || error instanceof Errno.EEXIST) {
        return this.onFileClashBehavior();
      }
      throw error;
    }
  }

  /** @internal */
  protected onFileClashBehavior(): void {
    this.sayStatus("file_clash", ":red");
  }

  /** @internal */
  protected onConflictBehavior(..._rest: unknown[]): void | Promise<void> {
    this.sayStatus("exist", ":blue");
  }

  /** @internal */
  protected sayStatus(status: string, color: unknown): void {
    if (rtest(this.config["verbose"])) {
      this.base.shell.sayStatus(status, this.relativeDestination, color);
    }
  }
}
