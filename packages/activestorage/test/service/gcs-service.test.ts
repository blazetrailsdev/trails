import { beforeEach, describe, expect, it } from "vitest";
import { minutes } from "@blazetrails/activesupport";
import { Utils } from "@blazetrails/rack";
import { OpenSSL } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { Filename } from "../../lib/filename.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import "../../lib/service/gcs-service.js";
import { SERVICE_CONFIGURATIONS } from "../support/test-helper.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const SERVICE = SERVICE_CONFIGURATIONS.gcs
  ? Service.configure("gcs", SERVICE_CONFIGURATIONS)
  : null;

describe.skipIf(!SERVICE_CONFIGURATIONS.gcs)("ActiveStorage::Service::GCSServiceTest", () => {
  const ctx = SharedServiceTests(SERVICE!);

  it("name", () => {
    expect(ctx.service.name).toBe("gcs");
  });

  it("signed URL generation", async () => {
    expect(
      await ctx.service.url(ctx.key, {
        expiresIn: minutes(2),
        disposition: "inline",
        filename: new Filename("test.txt"),
        contentType: "text/plain",
      }),
    ).toMatch(/response-content-disposition=inline.*test\.txt.*response-content-type=text%2Fplain/);
  });
});

describe("ActiveStorage::Service::GCSServiceDirectUploadSignatureTest", () => {
  let signingKey: InstanceType<typeof OpenSSL.PKey.RSA>;
  let service: Service;
  let checksum: string;

  beforeEach(() => {
    signingKey = new OpenSSL.PKey.RSA(2048);
    service = Service.configure("gcs", {
      gcs: {
        service: "GCS",
        bucket: "bucket",
        cacheControl: "public, max-age=1800",
        projectId: "project",
        credentials: {
          type: "service_account",
          project_id: "project",
          client_email: "uploader@project.iam.gserviceaccount.com",
          private_key: signingKey.toPem(),
        },
      },
    });
    checksum = OpenSSL.Digest.MD5.base64digest("Some text");
  });

  async function isAuthorizes(
    url: string,
    {
      contentType,
      checksum,
      contentLengthRange,
    }: { contentType: string; checksum: string; contentLengthRange: string | null },
  ): Promise<boolean> {
    const query = Utils.parseQuery(new URL(url).search.slice(1));
    const extensionHeaders =
      contentLengthRange != null ? `x-goog-content-length-range:${contentLengthRange}\n` : "";
    const stringToSign = [
      "PUT",
      checksum,
      contentType,
      query["Expires"],
      `${extensionHeaders}/bucket/key`,
    ].join("\n");

    const publicKey = await crypto.subtle.importKey(
      "spki",
      signingKey._publicKeyDer as Uint8Array<ArrayBuffer>,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Uint8Array.from(atob(String(query["Signature"] ?? "")), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(stringToSign),
    );
  }

  async function urlForKey(): Promise<string> {
    return await service.urlForDirectUpload("key", {
      expiresIn: minutes(5),
      contentType: "text/plain",
      contentLength: 9,
      checksum: checksum,
    });
  }

  it("direct upload with cache control authorizes only an empty Content-Type", async () => {
    const url = await urlForKey();
    expect(await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: "9,9" })).toBe(
      true,
    );
    expect(
      await isAuthorizes(url, { contentType: "text/html", checksum, contentLengthRange: "9,9" }),
    ).toBe(false);
  });

  it("direct upload with cache control authorizes only the declared checksum", async () => {
    const url = await urlForKey();
    expect(await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: "9,9" })).toBe(
      true,
    );
    expect(
      await isAuthorizes(url, {
        contentType: "",
        checksum: OpenSSL.Digest.MD5.base64digest("Other text"),
        contentLengthRange: "9,9",
      }),
    ).toBe(false);
  });

  it("direct upload authorizes only the declared content length", async () => {
    const url = await urlForKey();
    expect(await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: "9,9" })).toBe(
      true,
    );
    expect(
      await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: "0,1000" }),
    ).toBe(false);
    expect(await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: null })).toBe(
      false,
    );
  });

  it("direct upload headers with cache control include Cache-Control", () => {
    const headers = service.headersForDirectUpload("key", {
      checksum,
      contentLength: 9,
      filename: new Filename("test.txt"),
      contentType: "text/plain",
    });
    expect(headers["Cache-Control"]).toBe("public, max-age=1800");
  });

  it("direct upload headers include the declared content length range", () => {
    const headers = service.headersForDirectUpload("key", {
      checksum,
      contentLength: 9,
      filename: new Filename("test.txt"),
      contentType: "text/plain",
    });
    expect(headers["x-goog-content-length-range"]).toBe("9,9");
  });
});
