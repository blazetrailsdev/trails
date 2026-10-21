import {
  Pathname,
  Enumerator,
  File,
  FileUtils,
  Dir,
  rbCheckArrayType,
  Range,
  rbStrSend,
  arySlice,
  rbEqual,
} from "@blazetrails/ruby-compat";
import "../marcel.js";

export function files(name: string) {
  return new Pathname(fixturePath(name));
}

export function fixturePath(name: string) {
  return File.expandPath(`../fixtures/${name ?? ""}`, import.meta.filename);
}

export function eachContentTypeFixture(folder: string, block?: (...args: unknown[]) => unknown) {
  return FileUtils.chdir(fixturePath(folder), undefined, () => {
    return ((x) =>
      x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
        ? [...x]
        : Object.getPrototypeOf(x) === Object.prototype
          ? Object.entries(x as object)
          : (x as unknown[]))(Dir.glob("**/*.*")).map((name) => {
      let _, contentType, extra;
      if (File.isFile(name as string)) {
        [_, contentType, extra, _] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))([
          ...name.match(/^([^/]+\/[^/]*)\/?(.*)\.(\w+)$/m),
        ]);
        if (
          rbEqual(
            typeof contentType === "string"
              ? rbStrSend(
                  contentType,
                  "get",
                  new Range(
                    -(contentType instanceof globalThis.Set || contentType instanceof globalThis.Map
                      ? contentType.size
                      : contentType.length),
                    -1,
                    false,
                  ),
                )[0]
              : arySlice(
                  contentType as unknown[],
                  new Range(
                    -(contentType instanceof globalThis.Set || contentType instanceof globalThis.Map
                      ? contentType.size
                      : contentType.length),
                    -1,
                    false,
                  ),
                ),
            extra,
          )
        ) {
          // eslint-disable-next-line no-useless-assignment -- test_helper.rb:35 assigns it unread
          extra = null;
        }
        return block(files(`${folder ?? ""}/${name ?? ""}`), name, contentType);
      }
      return null;
    });
  });
}
