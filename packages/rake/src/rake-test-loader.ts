import { File, LOAD_PATH, abort, getPath, rbArgv } from "@blazetrails/ruby-compat";
import { FileList } from "./file-list.js";

const argv: string[] = [];
for (const argument of rbArgv()) {
  if (/^-I/.test(argument)) {
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
      await import(getPath().pathToFileURL!(File.expandPath(file)).href);
    }
  } else {
    const path = File.expandPath(argument);

    if (!(await File.isExistAsync(path))) abort(`\nFile does not exist: ${path}\n\n`);

    await import(getPath().pathToFileURL!(path).href);
  }
}

rbArgv().splice(0, rbArgv().length, ...argv);
