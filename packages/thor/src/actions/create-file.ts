import {
  bytes,
  File,
  FileUtils,
  forceEncoding,
  getFs,
  Hash,
  merge,
  rbEqual,
  rbObjIsKindOf,
  rtest,
  toS,
} from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { EmptyDirectory, type EmptyDirectoryBase } from "./empty-directory.js";

type Block = () => unknown;
type Data = string | Uint8Array | (() => unknown);

export function createFile(this: ActionsHost, destination: string, ...args: unknown[]): unknown {
  const block = (typeof (args.at(-1) ?? null) === "function" ? args.pop() : undefined) as
    | (() => unknown)
    | undefined;
  const config = (rbObjIsKindOf(args.at(-1) ?? null, Hash) ? args.pop() : {}) as Record<
    string,
    unknown
  >;
  const data = args[0];
  return this.action(
    new CreateFile(
      this,
      destination,
      block || (data instanceof Uint8Array ? data : toS(data)),
      config,
    ),
  );
}
export const addFile = createFile;

export class CreateFile extends EmptyDirectory {
  data: Data;
  /** @internal */
  private _render?: string | Uint8Array;

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
    let render: string | Uint8Array;
    return (
      (await this.isExists()) &&
      rbEqual(
        await getFs().readFile(this.destination),
        (render = forceEncoding(await this.render(), "ASCII-8BIT")) instanceof Uint8Array
          ? render
          : Uint8Array.from(bytes(render)),
      )
    );
  }

  async render(): Promise<string | Uint8Array> {
    return (this._render ??= (typeof this.data === "function" ? await this.data() : this.data) as
      | string
      | Uint8Array);
  }

  override async invokeBang(): Promise<unknown> {
    await this.invokeWithConflictCheck(async () => {
      await FileUtils.mkdirPAsync(File.dirname(this.destination));
      await File.writeAsync(this.destination, await this.render(), {
        perm: this.config["perm"] as number | undefined,
      });
    });
    return this.givenDestination;
  }

  /** @internal */
  protected override async onConflictBehavior(block: Block): Promise<void> {
    if (await this.isIdentical()) {
      this.sayStatus("identical", ":blue");
    } else {
      // eslint-disable-next-line blazetrails/ruby-compat-native-required -- base.options is a HashWithIndifferentAccess, which merge dispatches on
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
    return this.base.shell.fileCollision(this.destination, () => this.render());
  }
}
