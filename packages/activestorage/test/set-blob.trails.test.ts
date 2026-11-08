import { beforeEach, describe, expect, it, vi } from "vitest";
import { include, isModuleIncluded } from "@blazetrails/ruby-compat";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import "./support/database/setup.js";
import { ActiveStorage } from "../lib/active-storage.js";
import { BaseController } from "../lib/base-controller.js";
import { Current } from "../lib/current.js";
import { DisableSession } from "../lib/disable-session.js";
import { FileServer } from "../lib/file-server.js";
import { SetBlob } from "../lib/set-blob.js";
import { SetCurrent } from "../lib/set-current.js";
import { createBlob } from "./support/test-helper.js";

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
    expect(head).toHaveBeenCalledWith(":not_found");
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

  it("drops the cascade headers from a 416 response", () => {
    const headers = new Map([["x-cascade", "pass"]]);
    const host = {
      request: {
        isOptions: () => false,
        isHead: () => false,
        getHeader: (name: string) => (name === "HTTP_RANGE" ? "bytes=999999999-" : null),
      },
      response: { headers },
    };
    FileServer.serveFile.call(host as never, import.meta.filename, {
      contentType: "text/plain",
      disposition: null,
    });
    expect((host as unknown as { status: number }).status).toBe(416);
    expect(headers.has("x-cascade")).toBe(false);
    expect(headers.get("Content-Disposition")).toBe("attachment");
  });
});

function beforeActionBlock(klass: object): (this: unknown) => void {
  let block!: (this: unknown) => void;
  include(
    Object.assign(class {}, {
      beforeAction(fn: (this: unknown) => void) {
        block = fn;
      },
    }),
    klass as never,
  );
  return block;
}

describe("ActiveStorage concerns", () => {
  it("BaseController includes SetCurrent, which sets Current.urlOptions", () => {
    expect(isModuleIncluded(BaseController, SetCurrent)).toBe(true);
    beforeActionBlock(SetCurrent).call({
      request: { protocol: "https://", host: "example.com", port: 443 },
    });
    expect(Current.urlOptions).toEqual({ protocol: "https://", host: "example.com", port: 443 });
  });

  it("DisableSession skips the session", () => {
    const sessionOptions: Record<string, unknown> = {};
    beforeActionBlock(DisableSession).call({ request: { sessionOptions } });
    expect(sessionOptions["skip"]).toBe(true);
  });
});
