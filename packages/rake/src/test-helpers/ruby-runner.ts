import { Dir, File, FileUtils, Open3 } from "@blazetrails/ruby-compat";
import { beforeEach } from "vitest";
import { FileUtils as RakeFileUtils } from "../file-utils.js";

const packages = File.expandPath(
  "../../..",
  decodeURIComponent(new URL(".", import.meta.url).pathname),
);
const rakeExec = File.join(packages, "rake", "bin", "rake.js");

export const RUBY = RakeFileUtils.RUBY;

export const runner = { out: "", err: "", exit: null as { exitstatus(): number | null } | null };

export function useRubyRunner(): void {
  beforeEach(async () => {
    await FileUtils.mkdirPAsync("node_modules/@blazetrails");
    for (const name of ["rake", "ruby-compat"]) {
      await File.symlinkAsync(File.join(packages, name), `node_modules/@blazetrails/${name}`);
    }
  });
}

export function ruby(...optionList: string[]): Promise<void> {
  return runRuby(optionList);
}

export function rake(...rakeOptions: string[]): Promise<void> {
  return runRuby([rakeExec, ...rakeOptions]);
}

export async function runRuby(optionList: string[]): Promise<void> {
  const [out, err, wait] = await Open3.capture3(RUBY, ...optionList, { chdir: Dir.pwd() });
  runner.exit = wait;
  runner.out = out as string;
  runner.err = err;
}
