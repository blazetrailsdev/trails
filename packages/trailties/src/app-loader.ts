import { Dir, File, Gem, Pathname, exec, rbArgv } from "@blazetrails/ruby-compat";

/** @internal */
export const AppLoader = {
  RUBY: Gem.ruby(),
  EXECUTABLES: ["bin/trails"],

  /** @noRailsEquivalent PERMANENT */
  exec: exec as (...argv: [exePath: string, ...args: string[]]) => void,

  execApp(): undefined {
    const originalCwd = Dir.pwd();

    for (;;) {
      const exe = this.findExecutable();
      if (exe != null) {
        const contents = File.read(exe);

        if (/set(App|Engine)Path/.test(contents)) {
          this.exec(this.RUBY, exe, ...rbArgv());
          break;
        }
      }

      if (new Pathname(Dir.pwd()).isRoot()) {
        Dir.chdir(originalCwd);
        return undefined;
      }

      Dir.chdir("..");
    }
  },

  findExecutable(): string | undefined {
    return this.EXECUTABLES.find((exe) => File.isFile(exe));
  },
};
