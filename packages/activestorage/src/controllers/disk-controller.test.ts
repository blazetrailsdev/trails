import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IntegrationTest, type RouteSet } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { OpenSSL } from "@blazetrails/ruby-compat";
import "../test-helpers/database/setup.js";
import { ActiveStorage } from "../active-storage.js";
import { Current } from "../current.js";
import "../disk-controller.js";
import {
  createBlob,
  createBlobBeforeDirectUpload,
  createFileBlob,
  withService,
} from "../test-helpers/test-helper.js";

const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
let session: IntegrationTest;
const variableContentTypesWas = ActiveStorage.variableContentTypes;
const webImageContentTypesWas = ActiveStorage.webImageContentTypes;

beforeEach(() => {
  ActiveStorage.verifier = new MessageVerifier("Testing");
  Current.urlOptions = { protocol: "https://", host: "example.com", port: null };
  session = new IntegrationTest(expect.getState().currentTestName!);
  session.app = routes;
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

    await session.get(await blob.url());
    session.assertResponse("ok");
    expect(session.response.headers.get("Content-Disposition")).toBe(
      "inline; filename=\"hello.jpg\"; filename*=UTF-8''hello.jpg",
    );
    expect(session.response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(session.response.body).toBe("Hello world!");
  });

  it("showing blob as attachment", async () => {
    const blob = await createBlob();
    await session.get(await blob.url({ disposition: "attachment" }));
    session.assertResponse("ok");
    expect(session.response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"hello.txt\"; filename*=UTF-8''hello.txt",
    );
    expect(session.response.headers.get("Content-Type")).toBe("text/plain");
    expect(session.response.body).toBe("Hello world!");
  });

  it("showing blob range", async () => {
    const blob = await createBlob();
    await session.get(await blob.url(), { headers: { Range: "bytes=5-9" } });
    session.assertResponse("partial_content");
    expect(session.response.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"hello.txt\"; filename*=UTF-8''hello.txt",
    );
    expect(session.response.headers.get("Content-Type")).toBe("text/plain");
    expect(session.response.body).toBe(" worl");
  });

  it("showing blob with invalid range", async () => {
    const blob = await createBlob();
    await session.get(await blob.url(), { headers: { Range: "bytes=1000-1000" } });
    session.assertResponse("range_not_satisfiable");
  });

  it("showing blob that does not exist", async () => {
    const blob = await createBlob();
    await blob.delete();

    await session.get(await blob.url());
    session.assertResponse("not_found");
  });

  it("showing blob with invalid key", async () => {
    await session.get(
      urlHelpers().trailsDiskServiceUrl({
        encoded_key: "Invalid key",
        filename: "hello.txt",
        host: "example.com",
      }),
    );
    session.assertResponse("not_found");
  });

  it("showing public blob", async () => {
    await withService("local_public", async () => {
      const blob = await createBlob({ contentType: "image/jpeg" });

      await session.get(await blob.url());
      session.assertResponse("ok");
      expect(session.response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(session.response.body).toBe("Hello world!");
    });
  });

  it("showing public blob variant", async () => {
    ActiveStorage.variableContentTypes = ["image/jpeg"];
    ActiveStorage.webImageContentTypes = ["image/png", "image/jpeg", "image/gif"];
    await withService("local_public", async () => {
      const blob = await (await createFileBlob())
        .variant({ resizeToLimit: [100, 100] })
        .processed();

      await session.get((await blob.url())!);
      session.assertResponse("ok");
      expect(session.response.headers.get("Content-Type")).toBe("image/jpeg");
    });
  });

  it("directly uploading blob with integrity", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
    });

    await session.put(await blob.serviceUrlForDirectUpload(), {
      params: data,
      headers: { "Content-Type": "text/plain" },
    });
    session.assertResponse("no_content");
    expect(new TextDecoder().decode(await blob.download())).toBe(data);
  });

  it("directly uploading blob without integrity", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest("bad data"),
    });

    await session.put(await blob.serviceUrlForDirectUpload(), { params: data });
    session.assertResponse("unprocessable_entity");
    expect(await blob.service.isExist(blob.key)).toBeFalsy();
  });

  it("directly uploading blob with mismatched content type", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
    });

    await session.put(await blob.serviceUrlForDirectUpload(), {
      params: data,
      headers: { "Content-Type": "application/octet-stream" },
    });
    session.assertResponse("unprocessable_entity");
    expect(await blob.service.isExist(blob.key)).toBeFalsy();
  });

  it("directly uploading blob with different but equivalent content type", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
      contentType: "application/x-gzip",
    });

    await session.put(await blob.serviceUrlForDirectUpload(), {
      params: data,
      headers: { "Content-Type": "application/x-gzip" },
    });
    session.assertResponse("no_content");
    expect(new TextDecoder().decode(await blob.download())).toBe(data);
  });

  it("directly uploading blob with mismatched content length", async () => {
    const data = "Something else entirely!";
    const blob = await createBlobBeforeDirectUpload({
      byteSize: data.length - 1,
      checksum: OpenSSL.Digest.MD5.base64digest(data),
    });

    await session.put(await blob.serviceUrlForDirectUpload(), {
      params: data,
      headers: { "Content-Type": "text/plain" },
    });
    session.assertResponse("unprocessable_entity");
    expect(await blob.service.isExist(blob.key)).toBeFalsy();
  });

  it("directly uploading blob with invalid token", async () => {
    await session.put(
      urlHelpers().updateTrailsDiskServiceUrl({ encoded_token: "invalid", host: "example.com" }),
      { params: "Something else entirely!", headers: { "Content-Type": "text/plain" } },
    );
    session.assertResponse("not_found");
  });
});
