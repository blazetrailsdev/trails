import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { FileServer } from "./file-server.js";
import { SetBlob } from "./set-blob.js";
import { createBlob } from "./test-helpers/test-helper.js";

describe("ActiveStorage::SetBlob", () => {
  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
  });

  it("awaits find_signed! and reads signed_blob_id before signed_id", async () => {
    const blob = await createBlob();
    const params = new Map([["signed_blob_id", blob.signedId()]]);
    const host = { params, head: vi.fn(), blobScope: SetBlob.blobScope } as never as {
      blob: unknown;
    };
    await SetBlob.setBlob.call(host as never);
    expect((host.blob as { id: unknown }).id).toEqual(blob.id);
  });

  it("heads not_found for an invalid signature", async () => {
    const head = vi.fn();
    const params = new Map([["signed_id", "invalid"]]);
    await SetBlob.setBlob.call({ params, head, blobScope: SetBlob.blobScope } as never);
    expect(head).toHaveBeenCalledWith("not_found");
  });
});

describe("ActiveStorage::FileServer", () => {
  it("serves a file with the given content type and disposition", () => {
    const headers = new Map<string, string>();
    const host = {
      request: { isOptions: () => false, getHeader: () => null, isHead: () => false },
      response: { headers },
    };
    FileServer.serveFile.call(host as never, import.meta.filename, {
      contentType: null,
      disposition: "inline",
    });
    expect(headers.get("Content-Type")).toBe("application/octet-stream");
    expect(headers.get("Content-Disposition")).toBe("inline");
  });
});
