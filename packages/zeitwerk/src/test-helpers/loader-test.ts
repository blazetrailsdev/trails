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
  for (const loader of Registry.loaders) {
    for (const cref of Object.values(loader.autoloads)) cref.remove();
  }
  Registry.loaders.length = 0;
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

export async function withSetup(
  loader: Loader,
  files: [string, string?][],
  { dirs, namespace = Object }: { dirs?: string[]; namespace?: object },
  block: () => unknown,
): Promise<void> {
  await withFiles(files, async () => {
    const roots = dirs ?? [...new Set(files.map(([file]) => /^(rd\d+)\//.exec(file)?.[1] ?? "."))];
    for (const dir of roots) await loader.pushDir(dir, { namespace });

    for (const [file] of files) {
      const ignored = /^(ignored|.+\/ignored)\//.exec(file);
      if (File.basename(file) === "ignored.ts") await loader.ignore(file);
      else if (ignored != null) await loader.ignore(ignored[1]);

      const collapsed = /^(collapsed|.+\/collapsed)\//.exec(file);
      if (collapsed != null) await loader.collapse(collapsed[1]);
    }

    await loader.setup();
    await block();
  });
}
