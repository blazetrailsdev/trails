import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { Loader } from "../loader.js";
import { ExplicitNamespaces } from "../registry/explicit-namespaces.js";
import { Registry } from "../registry.js";

export function newLoader(): Loader {
  const loader = new Loader();
  loader.enableReloading();
  return loader;
}

export function teardown(): void {
  Registry.loaders.clear();
  ExplicitNamespaces.clear();
}

export async function withFiles(files: [string, string?][], block: () => unknown): Promise<void> {
  const pwd = Dir.pwd();
  const tmp = Dir.mktmpdir("zeitwerk");
  Dir.chdir(tmp);
  try {
    for (const [fname, contents] of files) {
      FileUtils.mkdirP(File.dirname(fname));
      File.write(fname, contents ?? "");
    }
    await block();
  } finally {
    Dir.chdir(pwd);
    FileUtils.rmRf(tmp);
  }
}
