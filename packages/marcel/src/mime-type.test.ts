import {
  File,
  Pathname,
  RUBY_ENGINE,
  ObjectSpace,
  Tempfile,
  StringIO,
} from "@blazetrails/ruby-compat";
import { MimeType } from "./mime-type.js";
import { files } from "./test-helpers/test-helper.js";
import { beforeEach, expect, it, describe } from "vitest";

describe("MimeTypeTest", () => {
  let path: string;
  beforeEach(() => {
    path = files("image.gif").toString();
  });
  it("gets content type from Files", async () => {
    const contentType = await File.open(path, undefined, (file) => MimeType.for(file));
    expect(contentType).toEqual("image/gif");
  });
  it("gets content type from Pathnames", async () => {
    const contentType = await MimeType.for(new Pathname(path));
    expect(contentType).toEqual("image/gif");
  });
  it.skipIf(RUBY_ENGINE() === "jruby")("closes Pathname files after use", async () => {
    const openFiles: File[] = [];
    ObjectSpace.eachObject(File, (f) => {
      if (!(f as File).isClosed()) openFiles.push(f as File);
    });
    expect(openFiles.some((f) => f.path() === path)).toBe(false);
  });
  it("gets content type from Tempfiles", async () => {
    await Tempfile.open("Marcel", undefined, async (tempfile: Tempfile) => {
      await tempfile.write(await File.read(path));
      const contentType = await MimeType.for(tempfile);
      return expect(contentType).toEqual("image/gif");
    });
  });
  it("gets content type from IOs", async () => {
    const io = new StringIO(await File.read(path));
    const contentType = await MimeType.for(io);
    expect(contentType).toEqual("image/gif");
  });
  // PERMANENT-SKIP: Rack::Lint::InputWrapper is rack 2 (marcel.gemspec:25 `rack ~> 2.0`); trails ports rack 3.1.14, where it is Rack::Lint::Wrapper::InputWrapper (vendor/rack/v3.1.14/lib/rack/lint.rb:44, :445)
  it.skip("gets content type from sources that conform to Rack::Lint::InputWrapper", () => {});
});
