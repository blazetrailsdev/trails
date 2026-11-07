import { include, type Included } from "@blazetrails/activesupport";
import type { MockResponse, RackApp, Request, UploadedFileInfo } from "@blazetrails/rack";
import { Encoding, File, forceEncoding, Tempfile } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { FAKE_APP } from "./fixtures/fake-app.js";
import { encodingAwareStrings, Methods, type MethodsHost, Session } from "./index.js";
import { UploadedFile } from "./uploaded-file.js";

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Test::Methods`; the class/interface merge is how a mixin surfaces on the type side. */
interface Spec extends Included<typeof Methods> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
class Spec implements MethodsHost {
  app: RackApp = FAKE_APP;

  declare _rackTestCurrentSession: Session | undefined;

  fixturePath(name: string): string {
    return File.join(File.dirname(new URL(import.meta.url).pathname), "fixtures", name);
  }

  firstTestFilePath(): string {
    return this.fixturePath("foo.txt");
  }

  uploadedFile(): UploadedFile {
    return new UploadedFile(this.firstTestFilePath());
  }
}
include(Spec, Methods);

let spec: Spec;

beforeEach(() => {
  spec = new Spec();
});

const post = (
  uri: string,
  params?: unknown,
  env?: Record<string, unknown>,
): Promise<MockResponse> => spec.post(uri, params, env);
const lastRequest = (): Request => spec.lastRequest();
const fixturePath = (name: string): string => spec.fixturePath(name);
const firstTestFilePath = (): string => spec.firstTestFilePath();
const uploadedFile = (): UploadedFile => spec.uploadedFile();

describe("Rack::Test::Session uploading one file", () => {
  it("sends the multipart/form-data content type if no content type is specified", async () => {
    await post("/", { photo: uploadedFile() });
    expect(lastRequest().env["CONTENT_TYPE"]).toContain("multipart/form-data;");
  });

  it("sends multipart/related content type if it is explicitly specified", async () => {
    await post("/", { photo: uploadedFile() }, { CONTENT_TYPE: "multipart/related" });
    expect(lastRequest().env["CONTENT_TYPE"]).toContain("multipart/related;");
  });

  it("sends regular params", async () => {
    await post("/", { photo: uploadedFile(), foo: "bar" });
    expect(lastRequest().POST["foo"]).toBe("bar");
  });

  it("sends nested params", async () => {
    await post("/", { photo: uploadedFile(), foo: { bar: "baz" } });
    expect(lastRequest().POST["foo"]["bar"]).toBe("baz");
  });

  it("sends multiple nested params", async () => {
    await post("/", { photo: uploadedFile(), foo: { bar: { baz: "bop" } } });
    expect(lastRequest().POST["foo"]["bar"]["baz"]).toBe("bop");
  });

  it("sends params with arrays", async () => {
    await post("/", { photo: uploadedFile(), foo: ["1", "2"] });
    expect(lastRequest().POST["foo"]).toEqual(["1", "2"]);
  });

  it("sends params with encoding sensitive values", async () => {
    await post("/", { photo: uploadedFile(), foo: "bar? baz" });
    expect(lastRequest().POST["foo"]).toBe("bar? baz");
  });

  it("sends params encoded as ISO-8859-1", async () => {
    const utf8 = "☃";
    await post("/", { photo: uploadedFile(), foo: "bar", utf8: utf8 });
    expect(lastRequest().POST["foo"]).toBe("bar");

    const expectedValue = encodingAwareStrings() ? utf8 : forceEncoding(utf8, Encoding.BINARY);

    expect(lastRequest().POST["utf8"]).toBe(expectedValue);
  });

  it("sends params with parens in names", async () => {
    await post("/", { photo: uploadedFile(), "foo(1i)": "bar" });
    expect(lastRequest().POST["foo(1i)"]).toBe("bar");
  });

  it("sends params with encoding sensitive names", async () => {
    await post("/", { photo: uploadedFile(), "foo bar": "baz" });
    expect(lastRequest().POST["foo bar"]).toBe("baz");
  });

  it("sends files with the filename", async () => {
    await post("/", { photo: uploadedFile() });
    expect(lastRequest().POST["photo"].filename).toBe("foo.txt");
  });

  it("sends files with the text/plain MIME type by default", async () => {
    await post("/", { photo: uploadedFile() });
    expect(lastRequest().POST["photo"].type).toBe("text/plain");
  });

  it("sends files with the right name", async () => {
    await post("/", { photo: uploadedFile() });
    expect(lastRequest().POST["photo"].name).toBe("photo");
  });

  it("allows overriding the content type", async () => {
    await post("/", { photo: new UploadedFile(firstTestFilePath(), "image/jpeg") });
    expect(lastRequest().POST["photo"].type).toBe("image/jpeg");
  });

  it("sends files with a content-length in the header", async () => {
    await post("/", { photo: uploadedFile() });
    expect(lastRequest().POST["photo"].head).toContain("content-length: 4");
  });

  it("sends files as Tempfiles", async () => {
    await post("/", { photo: uploadedFile() });
    expect(lastRequest().POST["photo"].tempfile.constructor).toBe(Tempfile);
  });

  it("escapes spaces in filenames properly", async () => {
    await post("/", { photo: new UploadedFile(fixturePath("space case.txt")) });
    expect(lastRequest().POST["photo"].filename).toBe("space case.txt");
  });
});

describe("uploading two files", () => {
  const secondTestFilePath = (): string => fixturePath("bar.txt");

  const secondUploadedFile = (): UploadedFile => new UploadedFile(secondTestFilePath());

  it("sends the multipart/form-data content type", async () => {
    await post("/", { photos: [uploadedFile(), secondUploadedFile()] });
    expect(lastRequest().env["CONTENT_TYPE"]).toContain("multipart/form-data;");
  });

  it("sends files with the filename", async () => {
    await post("/", { photos: [uploadedFile(), secondUploadedFile()] });
    expect(
      (lastRequest().POST["photos"] as UploadedFileInfo[]).map((photo) => photo.filename),
    ).toEqual(["foo.txt", "bar.txt"]);
  });

  it("sends files with the text/plain MIME type by default", async () => {
    await post("/", { photos: [uploadedFile(), secondUploadedFile()] });
    expect((lastRequest().POST["photos"] as UploadedFileInfo[]).map((photo) => photo.type)).toEqual(
      ["text/plain", "text/plain"],
    );
  });

  it("sends files with the right names", async () => {
    await post("/", { photos: [uploadedFile(), secondUploadedFile()] });
    for (const photo of lastRequest().POST["photos"] as UploadedFileInfo[]) {
      expect(photo.name).toBe("photos[]");
    }
  });

  it("allows mixed content types", async () => {
    const imageFile = new UploadedFile(firstTestFilePath(), "image/jpeg");

    await post("/", { photos: [uploadedFile(), imageFile] });
    expect((lastRequest().POST["photos"] as UploadedFileInfo[]).map((photo) => photo.type)).toEqual(
      ["text/plain", "image/jpeg"],
    );
  });

  it("sends files with a content-length in the header", async () => {
    await post("/", { photos: [uploadedFile(), secondUploadedFile()] });
    for (const photo of lastRequest().POST["photos"] as UploadedFileInfo[]) {
      expect(photo.head).toContain("content-length: 4");
    }
  });

  it("sends both files as Tempfiles", async () => {
    await post("/", { photos: [uploadedFile(), secondUploadedFile()] });
    for (const photo of lastRequest().POST["photos"] as UploadedFileInfo[]) {
      expect(photo.tempfile.constructor).toBe(Tempfile);
    }
  });
});
