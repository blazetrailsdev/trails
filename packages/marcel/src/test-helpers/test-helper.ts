import { Pathname, File, FileUtils, Dir } from "@blazetrails/ruby-compat";
import "../marcel.js";

export function files(name: string) {
  return new Pathname(fixturePath(name));
}

export function fixturePath(name: string) {
  return File.expandPath(`../fixtures/${name}`, import.meta.filename);
}

export function eachContentTypeFixture(
  folder: string,
  block: (file: Pathname, name: string, contentType: string) => void,
) {
  return FileUtils.chdir(fixturePath(folder), () =>
    Dir.glob("**/*.*").map((name) => {
      if (File.isFile(name)) {
        let [, contentType, extra] = name.match(/^([^/]+\/[^/]*)\/?(.*)\.(\w+)$/)! as (
          | string
          | null
        )[];
        if (contentType!.slice(-contentType!.length) === extra) extra = null;
        return block(files(`${folder}/${name}`), name, contentType!);
      }
      return null;
    }),
  );
}
