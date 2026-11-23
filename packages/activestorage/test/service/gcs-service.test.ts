import { beforeEach, describe, expect, it } from "vitest";
import { Storage } from "@google-cloud/storage";
import { base58, minutes } from "@blazetrails/activesupport";
import { Utils } from "@blazetrails/rack";
import { Digest, OpenSSL, StringIO } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { FileNotFoundError } from "../../lib/errors.js";
import { Filename } from "../../lib/filename.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import { GCSService } from "../../lib/service/gcs-service.js";
import { SERVICE_CONFIGURATIONS } from "../support/test-helper.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const SERVICE = SERVICE_CONFIGURATIONS.gcs
  ? (Service.configure("gcs", SERVICE_CONFIGURATIONS) as GCSService)
  : null;

function configWithCacheControl(): Record<string, Record<string, unknown>> {
  return { gcs: { ...SERVICE_CONFIGURATIONS.gcs, cacheControl: "public, max-age=1800" } };
}

async function storedMetadata(key: string): Promise<Record<string, unknown>> {
  const { apiEndpoint, project, bucket } = SERVICE_CONFIGURATIONS.gcs;
  const storage = new Storage({ apiEndpoint: apiEndpoint as string, projectId: project as string });
  const [metadata] = await storage
    .bucket(bucket as string)
    .file(key)
    .getMetadata();
  return metadata;
}

async function v4UrlForDirectUpload(
  url: string,
  { checksum, contentLength }: { checksum: string; contentLength: number },
): Promise<string> {
  const key = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!);
  const { apiEndpoint, credentials, project, bucket } = SERVICE_CONFIGURATIONS.gcs;
  const storage = new Storage({
    apiEndpoint: (apiEndpoint as string).replace("localhost", "127.0.0.1"),
    credentials: credentials as Record<string, string>,
    projectId: project as string,
  });
  const [v4Url] = await storage
    .bucket(bucket as string)
    .file(key)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 5 * 60 * 1000,
      contentMd5: checksum,
      extensionHeaders: { "x-goog-content-length-range": `${contentLength},${contentLength}` },
      queryParams: { uploadType: "media", name: key },
    });
  return v4Url;
}

describe.skipIf(!SERVICE_CONFIGURATIONS.gcs)("ActiveStorage::Service::GCSServiceTest", () => {
  const ctx = SharedServiceTests(SERVICE!);

  it("direct upload", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      const checksum = OpenSSL.Digest.MD5.base64digest(data);
      const url = await ctx.service.urlForDirectUpload(key, {
        expiresIn: minutes(5),
        contentType: "text/plain",
        contentLength: data.length,
        checksum: checksum,
      });
      await fetch(await v4UrlForDirectUpload(url, { checksum, contentLength: data.length }), {
        method: "PUT",
        body: data,
        headers: {
          "Content-Type": "",
          "Content-MD5": checksum,
          "x-goog-content-length-range": `${data.length},${data.length}`,
        },
      });
      expect(new TextDecoder().decode(await ctx.service.download(key))).toBe(data);
    } finally {
      await ctx.service.delete(key);
    }
  });

  // PERMANENT-SKIP: fake-gcs-server enforces no x-goog-content-length-range, so the oversized v4 PUT is stored rather than refused with 400.
  it.skip("directly uploading file larger than the provided content-length does not work", async () => {
    const key = base58(24);
    const data = "Some text that is longer than the specified content length";
    const checksum = OpenSSL.Digest.MD5.base64digest(data);
    try {
      const url = await ctx.service.urlForDirectUpload(key, {
        expiresIn: minutes(5),
        contentType: "text/plain",
        contentLength: data.length - 1,
        checksum: checksum,
      });
      const uploadResult = await fetch(url, {
        method: "PUT",
        body: data,
        headers: {
          ...ctx.service.headersForDirectUpload(key, {
            checksum: checksum,
            contentLength: data.length - 1,
          }),
          "Content-Type": "",
        },
      });

      expect(String(uploadResult.status)).toBe("400");
      await expect(ctx.service.download(key)).rejects.toThrow(FileNotFoundError);
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("direct upload with content disposition", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    const checksum = OpenSSL.Digest.MD5.base64digest(data);
    try {
      const url = await ctx.service.urlForDirectUpload(key, {
        expiresIn: minutes(5),
        contentType: "text/plain",
        contentLength: data.length,
        checksum: checksum,
      });
      await fetch(await v4UrlForDirectUpload(url, { checksum, contentLength: data.length }), {
        method: "PUT",
        body: data,
        headers: {
          ...ctx.service.headersForDirectUpload(key, {
            checksum: checksum,
            contentLength: data.length,
            filename: new Filename("test.txt"),
            disposition: "attachment",
          }),
          "Content-Type": "",
        },
      });

      await ctx.service.url(key, {
        expiresIn: minutes(2),
        disposition: "inline",
        contentType: "text/html",
        filename: new Filename("test.html"),
      });
      expect((await storedMetadata(key)).contentDisposition).toBe(
        "attachment; filename=\"test.txt\"; filename*=UTF-8''test.txt",
      );
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("direct upload with cache control", async () => {
    const service = Service.configure("gcs", configWithCacheControl()) as GCSService;
    const key = base58(24);
    const data = "Some text";
    const checksum = Digest.MD5.base64digest(data);
    try {
      let url = await service.urlForDirectUpload(key, {
        expiresIn: minutes(5),
        contentType: "text/plain",
        contentLength: data.length,
        checksum: checksum,
      });
      const headers = service.headersForDirectUpload(key, {
        checksum: checksum,
        contentLength: data.length,
        filename: new Filename("test.txt"),
        disposition: "attachment",
      });
      expect(headers["Cache-Control"]).toBe("public, max-age=1800");
      await fetch(await v4UrlForDirectUpload(url, { checksum, contentLength: data.length }), {
        method: "PUT",
        body: data,
        headers: { ...headers, "Content-Type": "" },
      });

      url = await service.url(key, {
        expiresIn: minutes(2),
        disposition: "inline",
        contentType: "text/html",
        filename: new Filename("test.html"),
      });
      const response = await fetch(url.replace("//localhost:", "//127.0.0.1:"));
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=1800");
    } finally {
      await service.delete(key);
    }
  });

  // PERMANENT-SKIP: fake-gcs-server verifies no signature, so a v4 PUT with an unsigned Content-Type is stored rather than refused with 403; the unsigned Content-Type is asserted offline by "direct upload with cache control authorizes only an empty Content-Type".
  it.skip("direct upload with cache control rejects a Content-Type the URL does not sign", async () => {
    const service = Service.configure("gcs", configWithCacheControl()) as GCSService;
    const key = base58(24);
    const data = "<html></html>";
    const checksum = Digest.MD5.base64digest(data);
    try {
      const url = await service.urlForDirectUpload(key, {
        expiresIn: minutes(5),
        contentType: "image/png",
        contentLength: data.length,
        checksum: checksum,
      });
      const response = await fetch(url, {
        method: "PUT",
        body: data,
        headers: {
          ...service.headersForDirectUpload(key, {
            checksum: checksum,
            contentLength: data.length,
            filename: new Filename("test.png"),
            contentType: "image/png",
          }),
          "Content-Type": "text/html",
        },
      });

      expect(String(response.status)).toBe("403");
      expect(await service.isExist(key)).toBeFalsy();
    } finally {
      await service.delete(key);
    }
  });

  it("upload with content_type and content_disposition", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      await ctx.service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
        disposition: "attachment",
        filename: new Filename("test.txt"),
        contentType: "text/plain",
      });

      const url = await ctx.service.url(key, {
        expiresIn: minutes(2),
        disposition: "inline",
        contentType: "text/html",
        filename: new Filename("test.html"),
      });
      const response = await fetch(url.replace("//localhost:", "//127.0.0.1:"));
      expect(response.headers.get("Content-Type")?.split(";")[0]).toBe("text/plain");
      expect((await storedMetadata(key)).contentDisposition).toMatch(/attachment;.*test.txt/);
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("upload with content_type", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      await ctx.service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
        contentType: "text/plain",
      });

      const url = await ctx.service.url(key, {
        expiresIn: minutes(2),
        disposition: "inline",
        contentType: "text/html",
        filename: new Filename("test.html"),
      });
      const response = await fetch(url.replace("//localhost:", "//127.0.0.1:"));
      expect(response.headers.get("Content-Type")?.split(";")[0]).toBe("text/plain");
      expect(decodeURIComponent(url)).toMatch(/response-content-disposition=inline;.*test.html/);
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("upload with cache_control", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    const service = Service.configure("gcs", configWithCacheControl()) as GCSService;
    try {
      await service.upload(key, new StringIO(data), {
        checksum: Digest.MD5.base64digest(data),
        contentType: "text/plain",
      });

      const url = await service.url(key, {
        expiresIn: minutes(2),
        disposition: "inline",
        contentType: "text/html",
        filename: new Filename("test.html"),
      });
      const response = await fetch(url.replace("//localhost:", "//127.0.0.1:"));
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=1800");
    } finally {
      await service.delete(key);
    }
  });

  it("upload with custom_metadata", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      await ctx.service.upload(key, new StringIO(data), {
        checksum: Digest.MD5.base64digest(data),
        contentType: "text/plain",
        customMetadata: { foo: "baz" },
      });

      const url = await ctx.service.url(key, {
        expiresIn: minutes(2),
        disposition: "inline",
        contentType: "text/html",
        filename: new Filename("test.html"),
      });
      await fetch(url.replace("//localhost:", "//127.0.0.1:"));
      expect(((await storedMetadata(key)).metadata as Record<string, unknown>).foo).toBe("baz");
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("update custom_metadata", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      await ctx.service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
        disposition: "attachment",
        filename: new Filename("test.html"),
        contentType: "text/html",
        customMetadata: { foo: "baz" },
      });

      await ctx.service.updateMetadata(key, {
        disposition: "inline",
        filename: new Filename("test.txt"),
        contentType: "text/plain",
        customMetadata: { foo: "bar" },
      });
      const url = await ctx.service.url(key, {
        expiresIn: minutes(2),
        disposition: "attachment",
        contentType: "text/html",
        filename: new Filename("test.html"),
      });
      const response = await fetch(url.replace("//localhost:", "//127.0.0.1:"));
      expect(response.headers.get("Content-Type")?.split(";")[0]).toBe("text/plain");
      expect((await storedMetadata(key)).contentDisposition).toMatch(/inline;.*test.txt/);
      expect(((await storedMetadata(key)).metadata as Record<string, unknown>).foo).toBe("bar");
    } finally {
      await ctx.service.delete(key);
    }
  });

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

  it.skipIf(!Object.hasOwn(SERVICE_CONFIGURATIONS.gcs ?? {}, "gsaEmail"))(
    "direct upload with IAM signing",
    async () => {
      const service = Service.configure("gcs", {
        gcs: { ...SERVICE_CONFIGURATIONS.gcs, iam: true },
      });
      const key = base58(24);
      const data = "Some text";
      const checksum = Digest.MD5.base64digest(data);
      try {
        const url = await service.urlForDirectUpload(key, {
          expiresIn: minutes(5),
          contentType: "text/plain",
          contentLength: data.length,
          checksum: checksum,
        });
        await fetch(url, {
          method: "PUT",
          body: data,
          headers: {
            "Content-Type": "",
            "Content-MD5": checksum,
            "x-goog-content-length-range": `${data.length},${data.length}`,
          },
        });

        expect(new TextDecoder().decode(await service.download(key))).toBe(data);
      } finally {
        await service.delete(key);
      }
    },
  );

  it.skipIf(!Object.hasOwn(SERVICE_CONFIGURATIONS.gcs ?? {}, "gsaEmail"))(
    "url with IAM signing",
    async () => {
      const service = Service.configure("gcs", {
        gcs: { ...SERVICE_CONFIGURATIONS.gcs, iam: true },
      });
      expect(
        await service.url(base58(24), {
          expiresIn: minutes(2),
          disposition: "inline",
          filename: new Filename("test.txt"),
          contentType: "text/plain",
        }),
      ).toMatch(
        /response-content-disposition=inline.*test\.txt.*response-content-type=text%2Fplain/,
      );
    },
  );
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
    expect(
      await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: "9,9" }),
    ).toBeTruthy();
    expect(
      await isAuthorizes(url, { contentType: "text/html", checksum, contentLengthRange: "9,9" }),
    ).toBeFalsy();
  });

  it("direct upload with cache control authorizes only the declared checksum", async () => {
    const url = await urlForKey();
    expect(
      await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: "9,9" }),
    ).toBeTruthy();
    expect(
      await isAuthorizes(url, {
        contentType: "",
        checksum: OpenSSL.Digest.MD5.base64digest("Other text"),
        contentLengthRange: "9,9",
      }),
    ).toBeFalsy();
  });

  it("direct upload authorizes only the declared content length", async () => {
    const url = await urlForKey();
    expect(
      await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: "9,9" }),
    ).toBeTruthy();
    expect(
      await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: "0,1000" }),
    ).toBeFalsy();
    expect(
      await isAuthorizes(url, { contentType: "", checksum, contentLengthRange: null }),
    ).toBeFalsy();
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
