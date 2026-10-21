import {
  rbObjAsString,
  File,
  Pathname,
  Enumerator,
  RUBY_ENGINE,
  rbEqual,
  ObjectSpace,
  Tempfile,
  StringIO,
} from "@blazetrails/ruby-compat";
import { declined } from "./codegen-declined.js";
import { MimeType } from "./mime-type.js";
import { files } from "./test-helpers/test-helper.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("MimeTypeTest", () => {
  let path: unknown;
  beforeEach(async () => {
    path = await rbObjAsString(files("image.gif"));
  });
  it("gets content type from Files", async () => {
    const contentType = await File.open(
      path as string,
      undefined,
      undefined,
      async (file) => await MimeType.for(file),
    );
    expect(contentType).toEqual("image/gif");
  });
  it("gets content type from Pathnames", async () => {
    const contentType = await MimeType.for(
      new Pathname(path as string | Uint8Array<ArrayBufferLike> | { toPath(): string }),
    );
    expect(contentType).toEqual("image/gif");
  });
  it.skipIf(RUBY_ENGINE === "jruby")("closes Pathname files after use", async () => {
    const openFiles = await ((x) =>
      x instanceof globalThis.Set || x instanceof globalThis.Map || x instanceof Enumerator
        ? [...x]
        : Object.getPrototypeOf(x) === Object.prototype
          ? Object.entries(x as object)
          : (x as unknown[]))(await ObjectSpace.eachObject(File)).filter(
      (...xs: unknown[][]) =>
        !(
          ((((x: unknown) => x.isClosed()) as (...a: unknown[]) => unknown)(...xs) ?? false) !==
          false
        ),
    );
    expect(
      await (async (self, g) => {
        const xs: unknown[] = self;
        for (const x of xs) {
          const v = await g(x);
          if (v != null && v !== false) return false;
        }
        return true;
      })(openFiles, async (f: unknown) => rbEqual(await f.path(), path)),
    ).toBeRubyTruthy();
  });
  it("gets content type from Tempfiles", async () => {
    await Tempfile.open("Marcel", undefined, async (tempfile) => {
      await tempfile.write(await File.read(path as string));
      const contentType = await MimeType.for(tempfile);
      return expect(contentType).toEqual("image/gif");
    });
  });
  it("gets content type from IOs", async () => {
    const io = new StringIO(await File.read(path as string));
    const contentType = await MimeType.for(io);
    expect(contentType).toEqual("image/gif");
  });
  // PERMANENT-SKIP: Rack::Lint::InputWrapper is rack 2 (marcel.gemspec:25 `rack ~> 2.0`); trails ports rack 3.1.14, where it is Rack::Lint::Wrapper::InputWrapper (vendor/rack/v3.1.14/lib/rack/lint.rb:44, :445)
  it.skip("gets content type from sources that conform to Rack::Lint::InputWrapper", async () => {
    const io = new StringIO(await File.read(path as string));
    const wrapper = new (declined(
      "test/mime_type_test.rb:0",
      "const-unresolved",
      "Rack::Lint::InputWrapper",
    ))(io);
    const contentType = await MimeType.for(wrapper);
    expect(contentType).toEqual("image/gif");
  });
});
