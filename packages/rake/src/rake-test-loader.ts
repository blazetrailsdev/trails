import { File, abort, rbArgv, rbFLoad } from "@blazetrails/ruby-compat";
import { FileList } from "./file-list.js";

const argv: string[] = [];
for (const argument of rbArgv()) {
  if (/^-/m.test(argument)) {
    argv.push(argument);
  } else if (/\*/.test(argument)) {
    for (const file of (await FileList.get(argument).toA()) as string[]) {
      await rbFLoad(File.expandPath(file));
    }
  } else {
    const path = File.expandPath(argument);

    if (!(await File.isExistAsync(path))) abort(`\nFile does not exist: ${path}\n\n`);

    await rbFLoad(path);
  }
}

rbArgv().splice(0, rbArgv().length, ...argv);
