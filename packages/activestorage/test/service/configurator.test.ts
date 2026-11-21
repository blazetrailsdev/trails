import { describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Configurator } from "../../lib/service/configurator.js";
import { DiskService } from "../../lib/service/disk-service.js";

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
});
