import { describe, expect, it } from "vitest";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { base58, deepMerge, minutes } from "@blazetrails/activesupport";
import { Digest, OpenSSL, SecureRandom, StringIO } from "@blazetrails/ruby-compat";
import "../support/database/setup.js";
import { FileNotFoundError } from "../../lib/errors.js";
import { Filename } from "../../lib/app/models/active-storage/filename.js";
import { Service } from "../../lib/service.js";
import "../../lib/service/configurator.js";
import { S3Service } from "../../lib/service/s3-service.js";
import {
  SERVICE_CONFIGURATIONS,
  User,
  directlyUploadFileBlob,
  offlineServiceConfigurations,
} from "../support/test-helper.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const SERVICE = SERVICE_CONFIGURATIONS.s3
  ? (Service.configure("s3", SERVICE_CONFIGURATIONS) as S3Service)
  : null;

function buildService(configuration: Record<string, unknown>): S3Service {
  return Service.configure(
    "s3",
    deepMerge(SERVICE_CONFIGURATIONS, { s3: configuration }),
  ) as S3Service;
}

async function head(service: S3Service, key: string) {
  return await service.client.send(new HeadObjectCommand({ Bucket: service.bucket, Key: key }));
}

describe.skipIf(!SERVICE_CONFIGURATIONS.s3)("ActiveStorage::Service::S3ServiceTest", () => {
  const ctx = SharedServiceTests(SERVICE!);
  const encode = (data: string) => new TextEncoder().encode(data);

  it("name", () => {
    expect(ctx.service.name).toBe("s3");
  });

  it("direct upload", async () => {
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

      await fetch(url, {
        method: "PUT",
        body: data,
        headers: { "Content-Type": "text/plain", "Content-MD5": checksum },
      });

      expect(await ctx.service.download(key)).toEqual(encode(data));
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

      await fetch(url, {
        method: "PUT",
        body: data,
        headers: ctx.service.headersForDirectUpload(key, {
          checksum: checksum,
          contentType: "text/plain",
          filename: new Filename("test.txt"),
          disposition: "attachment",
          contentLength: data.length,
        }),
      });

      expect((await head(ctx.service, key)).ContentDisposition).toBe(
        "attachment; filename=\"test.txt\"; filename*=UTF-8''test.txt",
      );
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("directly uploading file larger than the provided content-length does not work", async () => {
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
        headers: { "Content-Type": "text/plain", "Content-MD5": checksum },
      });

      expect(String(uploadResult.status)).toBe("403");
      await expect(ctx.service.download(key)).rejects.toThrow(FileNotFoundError);
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("upload a zero byte file", async () => {
    const blob = await directlyUploadFileBlob({ filename: "empty_file.txt", contentType: null });
    const user = await User.createBang({ name: "DHH", avatar: blob });

    expect(user.avatar.blob).toEqual(blob);
  });

  it("signed URL generation", async () => {
    const configurations = offlineServiceConfigurations();
    const url = await (Service.configure("s3", configurations) as S3Service).url(ctx.key, {
      expiresIn: minutes(5),
      disposition: "inline",
      filename: new Filename("avatar.png"),
      contentType: "image/png",
    });

    expect(url).toMatch(
      /s3(-[-a-z0-9]+)?\.(\S+)?amazonaws.com.*response-content-disposition=inline.*avatar\.png.*response-content-type=image%2Fpng/,
    );
    expect(url).toMatch(String(configurations.s3.bucket));
  });

  it("uploading with server-side encryption", async () => {
    const service = buildService({ upload: { serverSideEncryption: "AES256" } });

    const key = base58(24);
    try {
      const data = "Something else entirely!";
      await service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
      });

      expect((await head(service, key)).ServerSideEncryption).toBe("AES256");
    } finally {
      await service.delete(key);
    }
  });

  it("upload with content type", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    const contentType = "text/plain";
    try {
      await ctx.service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
        filename: new Filename("cool_data.txt"),
        contentType: contentType,
      });

      expect((await head(ctx.service, key)).ContentType).toBe(contentType);
    } finally {
      await ctx.service.delete(key);
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
        filename: new Filename("custom_metadata.txt"),
      });

      const url = await ctx.service.url(key, {
        expiresIn: minutes(2),
        disposition: "inline",
        contentType: "text/html",
        filename: new Filename("test.html"),
      });

      const response = await fetch(url);
      expect(response.headers.get("x-amz-meta-foo")).toBe("baz");
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("upload with content disposition", async () => {
    const key = base58(24);
    const data = "Something else entirely!";
    try {
      await ctx.service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
        filename: new Filename("cool_data.txt"),
        disposition: "attachment",
      });

      expect((await head(ctx.service, key)).ContentDisposition).toBe(
        "attachment; filename=\"cool_data.txt\"; filename*=UTF-8''cool_data.txt",
      );
    } finally {
      await ctx.service.delete(key);
    }
  });

  it("uploading a large object in multiple parts", async () => {
    const service = buildService({ upload: { multipartThreshold: 5 * 1024 * 1024 } });

    const key = base58(24);
    try {
      const data = new Uint8Array(SecureRandom.bytes(8 * 1024 * 1024));

      await service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
      });
      const downloaded = await service.download(key);
      expect(
        downloaded.length === data.length && data.every((byte, i) => byte === downloaded[i]),
      ).toBeTruthy();
    } finally {
      await service.delete(key);
    }
  });

  it("uploading a small object with multipart_threshold configured", async () => {
    const service = buildService({ upload: { multipartThreshold: 5 * 1024 * 1024 } });

    const key = base58(24);
    try {
      const data = new Uint8Array(SecureRandom.bytes(3 * 1024 * 1024));

      await service.upload(key, new StringIO(data), {
        checksum: OpenSSL.Digest.MD5.base64digest(data),
      });
      const downloaded = await service.download(key);
      expect(
        downloaded.length === data.length && data.every((byte, i) => byte === downloaded[i]),
      ).toBeTruthy();
    } finally {
      await service.delete(key);
    }
  });
});
