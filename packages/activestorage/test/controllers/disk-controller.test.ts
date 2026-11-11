import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RouteSet } from "@blazetrails/actionpack";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { TopLevel } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { OpenSSL } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { ActiveStorage } from "../../lib/active-storage.js";
import { Current } from "../../lib/current.js";
import "../../lib/disk-controller.js";
import {
  createBlob,
  createBlobBeforeDirectUpload,
  createFileBlob,
  withService,
} from "../support/test-helper.js";

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
let t: IntegrationTest;
const variableContentTypesWas = ActiveStorage.variableContentTypes;
const webImageContentTypesWas = ActiveStorage.webImageContentTypes;

beforeEach(() => {
  ActiveStorage.verifier = new MessageVerifier("Testing");
  Current.urlOptions = { protocol: "https://", host: "example.com", port: null };
  t = new IntegrationTest(expect.getState().currentTestName!);
  t.app = routes;
});

afterEach(() => {
  Current.reset();
  ActiveStorage.variableContentTypes = variableContentTypesWas;
  ActiveStorage.webImageContentTypes = webImageContentTypesWas;
});

function urlHelpers() {
  return routes.urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;
}

describe("ActiveStorage::DiskControllerTest", () => {
  it("showing blob inline", async () => {
    const blob = await createBlob({ filename: "hello.jpg", contentType: "image/jpeg" });

    await t.get(await blob.url());
    t.assertResponse(":ok");
    expect(t.response.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"hello.jpg\"; filename*=UTF-8''hello.jpg",
    );
    expect(t.response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(t.response.body).toBe("Hello world!");
  });

  it("showing blob as attachment", async () => {
    const blob = await createBlob();
    await t.get(await blob.url({ disposition: "attachment" }));
    t.assertResponse(":ok");
    expect(t.response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"hello.txt\"; filename*=UTF-8''hello.txt",
    );
    expect(t.response.headers.get("Content-Type")).toBe("text/plain");
    expect(t.response.body).toBe("Hello world!");
  });

  it("showing blob range", async () => {
    const blob = await createBlob();
    await t.get(await blob.url(), { headers: { Range: "bytes=5-9" } });
    t.assertResponse(":partial_content");
    expect(t.response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"hello.txt\"; filename*=UTF-8''hello.txt",
    );
    expect(t.response.headers.get("Content-Type")).toBe("text/plain");
    expect(t.response.body).toBe(" worl");
  });

  it("showing blob with invalid range", async () => {
    const blob = await createBlob();
    await t.get(await blob.url(), { headers: { Range: "bytes=1000-1000" } });
    t.assertResponse(":range_not_satisfiable");
  });

  it("showing blob that does not exist", async () => {
    const blob = await createBlob();
    await blob.delete();

    await t.get(await blob.url());
    t.assertResponse(":not_found");
  });

  it("showing blob with invalid key", async () => {
    await t.get(
      urlHelpers().trailsDiskServiceUrl({
        encoded_key: "Invalid key",
        filename: "hello.txt",
        host: "example.com",
      }),
    );
    t.assertResponse(":not_found");
  });

  it("showing public blob", async () => {
    await withService("local_public", async () => {
      const blob = await createBlob({ contentType: "image/jpeg" });

      await t.get(await blob.url());
      t.assertResponse(":ok");
      expect(t.response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(t.response.body).toBe("Hello world!");
    });
  });

  it("showing public blob variant", async () => {
    ActiveStorage.variableContentTypes = ["image/jpeg"];
    ActiveStorage.webImageContentTypes = ["image/png", "image/jpeg", "image/gif"];
    await withService("local_public", async () => {
      const blob = await (await createFileBlob())
        .variant({ resizeToLimit: [100, 100] })
        .processed();

      await t.get((await blob.url())!);
      t.assertResponse(":ok");
      expect(t.response.headers.get("Content-Type")).toBe("image/jpeg");
    });
  });

  it("directly uploading blob with integrity", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
    });

    await t.put(await blob.serviceUrlForDirectUpload(), {
      params: data,
      headers: { "Content-Type": "text/plain" },
    });
    t.assertResponse(":no_content");
    expect(new TextDecoder().decode(await blob.download())).toBe(data);
  });

  it("directly uploading blob without integrity", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest("bad data"),
    });

    await t.put(await blob.serviceUrlForDirectUpload(), { params: data });
    t.assertResponse(":unprocessable_entity");
    expect(await blob.service.isExist(blob.key)).toBeFalsy();
  });

  it("directly uploading blob with mismatched content type", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
    });

    await t.put(await blob.serviceUrlForDirectUpload(), {
      params: data,
      headers: { "Content-Type": "application/octet-stream" },
    });
    t.assertResponse(":unprocessable_entity");
    expect(await blob.service.isExist(blob.key)).toBeFalsy();
  });

  it("directly uploading blob with different but equivalent content type", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
      contentType: "application/x-gzip",
    });

    await t.put(await blob.serviceUrlForDirectUpload(), {
      params: data,
      headers: { "Content-Type": "application/x-gzip" },
    });
    t.assertResponse(":no_content");
    expect(new TextDecoder().decode(await blob.download())).toBe(data);
  });

  it("directly uploading blob with mismatched content length", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length - 1,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
    });

    await t.put(await blob.serviceUrlForDirectUpload(), {
      params: data,
      headers: { "Content-Type": "text/plain" },
    });
    t.assertResponse(":unprocessable_entity");
    expect(await blob.service.isExist(blob.key)).toBeFalsy();
  });

  it("directly uploading blob with invalid token", async () => {
    await t.put(
      urlHelpers().updateTrailsDiskServiceUrl({ encoded_token: "invalid", host: "example.com" }),
      { params: "Something else entirely!", headers: { "Content-Type": "text/plain" } },
    );
    t.assertResponse(":not_found");
  });
});
