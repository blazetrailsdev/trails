import { describe, expect, it } from "vitest";
import { minutes } from "@blazetrails/activesupport";
import { ArgumentError, Digest, Dir, File } from "@blazetrails/ruby-compat";
import { base58 } from "@blazetrails/activesupport";
import { Current } from "../current.js";
import { Filename } from "../filename.js";
import { Service } from "../service.js";
import "./configurator.js";
import type { DiskService } from "./disk-service.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const tmpConfig = { tmp: { service: "Disk", root: File.join(Dir.tmpdir(), "active_storage") } };
const SERVICE = Service.configure("tmp", tmpConfig) as DiskService;

describe("ActiveStorage::Service::DiskServiceTest", () => {
  const ctx = SharedServiceTests(SERVICE);

  it("name", () => {
    expect(ctx.service.name).toBe("tmp");
  });

  it("url_for_direct_upload", () => {
    const originalUrlOptions = { ...ctx.routes.defaultUrlOptions };
    Object.assign(ctx.routes.defaultUrlOptions, {
      protocol: "http",
      host: "test.example.com",
      port: 3001,
    });

    const key = base58(24);
    const data = "Something else entirely!";
    const checksum = Digest.MD5.base64digest(data);

    try {
      expect(
        ctx.service.urlForDirectUpload(key, {
          expiresIn: minutes(5),
          contentType: "text/plain",
          contentLength: data.length,
          checksum: checksum,
        }),
      ).toMatch(/^https:\/\/example.com\/rails\/active_storage\/disk\/.*$/);
    } finally {
      ctx.routes.defaultUrlOptions = originalUrlOptions;
    }
  });

  it("URL generation", () => {
    const originalUrlOptions = { ...ctx.routes.defaultUrlOptions };
    Object.assign(ctx.routes.defaultUrlOptions, {
      protocol: "http",
      host: "test.example.com",
      port: 3001,
    });
    try {
      expect(
        ctx.service.url(ctx.key, {
          expiresIn: minutes(5),
          disposition: "inline",
          filename: new Filename("avatar.png"),
          contentType: "image/png",
        }),
      ).toMatch(/^https:\/\/example.com\/rails\/active_storage\/disk\/.*\/avatar\.png$/);
    } finally {
      ctx.routes.defaultUrlOptions = originalUrlOptions;
    }
  });

  it("URL generation without ActiveStorage::Current.url_options set", () => {
    (Current as unknown as { urlOptions: unknown }).urlOptions = null;

    let error: unknown;
    expect(() => {
      try {
        ctx.service.url(ctx.key, {
          expiresIn: minutes(5),
          disposition: "inline",
          filename: new Filename("avatar.png"),
          contentType: "image/png",
        });
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(ArgumentError);

    expect((error as Error).message).toBe(
      "Cannot generate URL for avatar.png using Disk service, please set ActiveStorage::Current.url_options.",
    );
  });

  it("URL generation keeps working with ActiveStorage::Current.host set", () => {
    (Current as unknown as { urlOptions: unknown }).urlOptions = { host: "https://example.com" };

    const originalUrlOptions = { ...ctx.routes.defaultUrlOptions };
    Object.assign(ctx.routes.defaultUrlOptions, {
      protocol: "http",
      host: "test.example.com",
      port: 3001,
    });
    try {
      expect(
        ctx.service.url(ctx.key, {
          expiresIn: minutes(5),
          disposition: "inline",
          filename: new Filename("avatar.png"),
          contentType: "image/png",
        }),
      ).toMatch(/^http:\/\/example.com:3001\/rails\/active_storage\/disk\/.*\/avatar\.png$/);
    } finally {
      ctx.routes.defaultUrlOptions = originalUrlOptions;
    }
  });

  it("headers_for_direct_upload generation", () => {
    expect(
      ctx.service.headersForDirectUpload(ctx.key, { contentType: "application/json" }),
    ).toEqual({ "Content-Type": "application/json" });
  });

  it("root", () => {
    expect(ctx.service.root).toBe(tmpConfig.tmp.root);
  });

  it("can change root", () => {
    const tmpPath2 = File.join(Dir.tmpdir(), "active_storage_2");
    try {
      ctx.service.root = tmpPath2;

      expect(ctx.service.root).toBe(tmpPath2);
    } finally {
      ctx.service.root = tmpConfig.tmp.root;
    }
  });
});
