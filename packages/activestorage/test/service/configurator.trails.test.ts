import { describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Configurator } from "../../lib/service/configurator.js";
import { DiskService } from "../../lib/service/disk-service.js";
import { MirrorService } from "../../lib/service/mirror-service.js";

describe("Configurator.load", () => {
  it("raises Missing service adapter for a service with no file", async () => {
    const configurations = { azure: { service: "AzureStorage", container: "container" } };
    await Configurator.load();
    expect(() => Configurator.build("azure", configurations)).toThrow(
      new RuntimeError('Missing service adapter for "AzureStorage"'),
    );
  });

  it("resolves seated services after load", async () => {
    const configurations = {
      local: { service: "Disk", root: "path" },
      mirror: { service: "Mirror", primary: "local", mirrors: ["local"] },
    };
    await Configurator.load();
    expect(Configurator.build("local", configurations)).toBeInstanceOf(DiskService);
    expect(Configurator.build("mirror", configurations)).toBeInstanceOf(MirrorService);
  });
});
