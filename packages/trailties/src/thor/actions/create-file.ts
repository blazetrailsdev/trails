import {
  bytes,
  File,
  FileUtils,
  forceEncoding,
  getFs,
  Hash,
  last,
  merge,
  rbEqual,
  rbObjIsKindOf,
  rbStrSNew,
  rtest,
  toS,
} from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { EmptyDirectory, type EmptyDirectoryBase } from "./empty-directory.js";

type Block = () => unknown;
type Data = string | (() => unknown);

export function createFile(this: ActionsHost, destination: string, ...args: unknown[]): unknown {
  const block = (typeof last(args) === "function" ? args.pop() : undefined) as
    | (() => unknown)
    | undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  const data = args[0];
  return this.action(new CreateFile(this, destination, block || toS(data), config));
}
export const addFile = createFile;

export class CreateFile extends EmptyDirectory {
  data: Data;
  /** @internal */
  private _render?: string;

  constructor(
    base: EmptyDirectoryBase,
    destination: string | null | undefined,
    data: Data,
    config: Record<string, unknown> = {},
  ) {
    super(base, destination, config);
    this.data = data;
  }

  /** @missingRailsArgs force_encoding — PERMANENT */
  async isIdentical(): Promise<boolean> {
    return (
      (await this.isExists()) &&
      rbEqual(
        await getFs().readFile(this.destination),
        Uint8Array.from(bytes(forceEncoding(rbStrSNew(await this.render()), "ASCII-8BIT"))),
      )
    );
  }

  async render(): Promise<string> {
    return (this._render ??= (
      typeof this.data === "function" ? await this.data() : this.data
    ) as string);
  }

  override async invokeBang(): Promise<unknown> {
    await this.invokeWithConflictCheck(async () => {
      await FileUtils.mkdirPAsync(File.dirname(this.destination));
      await getFs().writeFile!(this.destination, await this.render(), {
        mode: this.config["perm"] as number | undefined,
      });
    });
    return this.givenDestination;
  }

  /** @internal */
  protected override async onConflictBehavior(block: Block): Promise<void> {
    if (await this.isIdentical()) {
      this.sayStatus("identical", ":blue");
    } else {
      const options = merge(this.base.options, this.config);
      await this.forceOrSkipOrConflict(options["force"], options["skip"], block);
    }
  }

  /** @internal */
  protected async forceOrSkipOrConflict(
    force: unknown,
    skip: unknown,
    block: Block,
  ): Promise<void> {
    if (rtest(force)) {
      this.sayStatus("force", ":yellow");
      if (!rtest(this.isPretend())) await block();
    } else if (rtest(skip)) {
      this.sayStatus("skip", ":yellow");
    } else {
      this.sayStatus("conflict", ":red");
      await this.forceOrSkipOrConflict(await this.isForceOnCollision(), true, block);
    }
  }

  /** @internal */
  protected isForceOnCollision(): unknown {
    return (
      this.base.shell as unknown as {
        fileCollision(destination: string, block: () => unknown): unknown;
      }
    ).fileCollision(this.destination, () => this.render());
  }
}
