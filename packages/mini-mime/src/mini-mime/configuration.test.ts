import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { File, rbObjIvarSet } from "@blazetrails/ruby-compat";
import { MiniMime } from "../mini-mime.js";

const __FILE__ = decodeURIComponent(new URL(import.meta.url).pathname);

describe("MiniMime::ConfigurationTest", () => {
  const CUSTOM_EXT_MIME_DB_PATH = File.expandPath(
    "../../test-helpers/fixtures/custom_ext_mime.db",
    __FILE__,
  );
  const CUSTOM_CONTENT_TYPE_MIME_DB_PATH = File.expandPath(
    "../../test-helpers/fixtures/custom_content_type_mime.db",
    __FILE__,
  );
  let oldExtDbPath: string;
  let oldContentTypeDbPath: string;

  beforeEach(() => {
    rbObjIvarSet(MiniMime.Db, "@db", null);
    oldExtDbPath = MiniMime.Configuration.extDbPath;
    oldContentTypeDbPath = MiniMime.Configuration.contentTypeDbPath;
  });

  afterEach(() => {
    rbObjIvarSet(MiniMime.Db, "@db", null);
    MiniMime.Configuration.extDbPath = oldExtDbPath;
    MiniMime.Configuration.contentTypeDbPath = oldContentTypeDbPath;
  });

  it("using custom ext mime db", () => {
    MiniMime.Configuration.extDbPath = CUSTOM_EXT_MIME_DB_PATH;

    expect(MiniMime.lookupByExtension("lua")!.contentType).toBe("application/x-lua");
    expect(MiniMime.lookupByExtension("m4v")!.encoding).toBe("quoted-printable");
  });

  it("using custom content type mime db", () => {
    MiniMime.Configuration.contentTypeDbPath = CUSTOM_CONTENT_TYPE_MIME_DB_PATH;

    expect(MiniMime.lookupByContentType("application/x-liquid")!.extension).toBe("liquid");
    expect(MiniMime.lookupByContentType("video/vnd.objectvideo")!.encoding).toBe(
      "quoted-printable",
    );
  });
});
