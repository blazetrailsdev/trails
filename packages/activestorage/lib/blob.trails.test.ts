import { beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { OpenSSL } from "@blazetrails/ruby-compat";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { IntegrityError } from "./errors.js";
import { createBlob } from "./test-helpers/test-helper.js";

describe("ActiveStorage::Blob#open", () => {
  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
  });

  it("yields a rewound tempfile named after the blob", async () => {
    const blob = await createBlob({ data: "Hello, world!" });

    const read = await blob.open({}, (file) => {
      expect(file.path()!.split("/").at(-1)!.startsWith(`ActiveStorage-${blob.id}-`)).toBe(true);
      expect(file.path()!.endsWith(".txt")).toBe(true);
      return new TextDecoder().decode(file.read() as Uint8Array);
    });

    expect(read).toBe("Hello, world!");
  });

  it("raises IntegrityError when the downloaded data does not match the checksum", async () => {
    const blob = await createBlob({ data: "Hello, world!" });
    blob.checksum = OpenSSL.Digest.MD5.base64digest("Goodbye, world!");

    await expect(
      blob.open({}, () => {
        expect.fail("Expected integrity check to fail");
      }),
    ).rejects.toThrow(IntegrityError);
  });
});
