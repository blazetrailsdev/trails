import { Dir, File, Gem, Pathname, exec, rbArgv } from "@blazetrails/ruby-compat";

/** @internal */
export const AppLoader = {
  RUBY: Gem.ruby(),
  EXECUTABLES: ["bin/trails", "script/trails"],

  execApp(): undefined {
    const originalCwd = Dir.pwd();

    for (;;) {
      const exe = this.findExecutable();
      if (exe != null) {
        const contents = File.read(exe);

        if (/(APP|ENGINE)_PATH/.test(contents)) {
          exec(this.RUBY, exe, ...rbArgv());
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
