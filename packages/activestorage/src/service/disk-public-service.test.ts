import { describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { Filename } from "../filename.js";
import { Service } from "../service.js";
import "./configurator.js";
import type { DiskService } from "./disk-service.js";
import { SharedServiceTests } from "./shared-service-tests.js";

const tmpConfig = {
  tmp_public: {
    service: "Disk",
    root: File.join(Dir.tmpdir(), "active_storage_public"),
    public: true,
  },
};
const SERVICE = Service.configure("tmp_public", tmpConfig) as DiskService;

describe("ActiveStorage::Service::DiskPublicServiceTest", () => {
  const ctx = SharedServiceTests(SERVICE);

  it("public URL generation", () => {
    const url = ctx.service.url(ctx.key, {
      disposition: "inline",
      filename: new Filename("avatar.png"),
      contentType: "image/png",
    });

    expect(url).toMatch(/^https:\/\/example.com\/rails\/active_storage\/disk\/.*\/avatar\.png/);
  });
});
