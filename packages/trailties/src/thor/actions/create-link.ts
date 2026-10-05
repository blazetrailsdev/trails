import { File, FileUtils, getFs, Hash, last, rbObjIsKindOf, rtest } from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { CreateFile } from "./create-file.js";

export function createLink(this: ActionsHost, destination: string, ...args: unknown[]): unknown {
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  const source = args[0] as string;
  return this.action(new CreateLink(this, destination, source, config));
}
export const addLink = createLink;

export class CreateLink extends CreateFile {
  override async isIdentical(): Promise<boolean> {
    const source = File.expandPath(await this.render(), File.dirname(this.destination));
    return (await this.isExists()) && (await File.isIdenticalAsync(source, this.destination));
  }

  override async invokeBang(): Promise<unknown> {
    await this.invokeWithConflictCheck(async () => {
      await FileUtils.mkdirPAsync(File.dirname(this.destination));
      if (this.config["symbolic"] == null) this.config["symbolic"] = true;
      if (await this.isExists()) await getFs().unlink!(this.destination);
      if (rtest(this.config["symbolic"])) {
        await File.symlinkAsync(await this.render(), this.destination);
      } else {
        await File.linkAsync(await this.render(), this.destination);
      }
    });
    return this.givenDestination;
  }

  override async isExists(): Promise<boolean> {
    return (await super.isExists()) || (await File.isSymlinkAsync(this.destination));
  }
}
