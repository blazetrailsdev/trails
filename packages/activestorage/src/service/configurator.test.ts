import { describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Configurator } from "./configurator.js";
import { DiskService } from "./disk-service.js";

describe("ActiveStorage::Service::ConfiguratorTest", () => {
  it("builds correct service instance based on service name", () => {
    const service = Configurator.build("foo", { foo: { service: "Disk", root: "path" } });
    expect(service).toBeInstanceOf(DiskService);
    expect((service as DiskService).root).toBe("path");
  });

  it("builds correct service instance based on lowercase service name", () => {
    const service = Configurator.build("foo", { foo: { service: "disk", root: "path" } });
    expect(service).toBeInstanceOf(DiskService);
    expect((service as DiskService).root).toBe("path");
  });

  it("raises error when passing non-existent service name", () => {
    expect(() => Configurator.build("bigfoot", {})).toThrow(RuntimeError);
  });

  // PERMANENT-SKIP: RFC 0209 non-goal — S3, GCS and Azure services (repo-owner scope ruling, 2026-10-28).
  it.skip("azure service is deprecated", () => {});
});
