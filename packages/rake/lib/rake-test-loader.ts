import { File } from "@blazetrails/ruby-compat/file";
import { LOAD_PATH, rbFRequireFile } from "@blazetrails/ruby-compat/load";
import { abort, rbArgv } from "@blazetrails/ruby-compat/process-adapter";
import { FileList } from "./file-list.js";

const argv: string[] = [];
for (const [index, argument] of rbArgv().entries()) {
  if (index === 0 && /^-I/.test(argument)) {
    LOAD_PATH.unshift(
      ...argument
        .slice(2)
        .split(File.PATH_SEPARATOR)
        .map((path) => File.expandPath(path)),
    );
  } else if (/^-/m.test(argument)) {
    argv.push(argument);
  } else if (/\*/.test(argument)) {
    for (const file of (await FileList.get(argument).toA()) as string[]) {
      await rbFRequireFile(File.expandPath(file));
    }
  } else {
    const path = File.expandPath(argument);

    if (!(await File.isExistAsync(path))) abort(`\nFile does not exist: ${path}\n\n`);

    await rbFRequireFile(path);
  }
}

rbArgv().splice(0, rbArgv().length, ...argv);
