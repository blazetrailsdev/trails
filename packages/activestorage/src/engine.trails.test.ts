import { describe, expect, it, vi } from "vitest";
import { onLoad, runLoadHooks } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/activerecord";
import { Identification } from "@blazetrails/globalid";
import { RuntimeError, isModuleIncluded } from "@blazetrails/ruby-compat";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { Engine } from "./engine.js";
import { Model } from "./attached/model.js";
import { Blob } from "./blob.js";
import { VariantRecord } from "./variant-record.js";
import { ActiveRecordExtensions } from "./reflection.js";
import { app } from "./test-helpers/database/setup.js";
import { ActiveStorage } from "./active-storage.js";
import { TopLevel, constantize } from "@blazetrails/activesupport";
import type { RouteSet } from "@blazetrails/actionpack";

describe("ActiveStorage::Engine", () => {
  it("includes the attachment modules and GlobalID::Identification into Base", () => {
    for (const mod of [Model, ActiveRecordExtensions, Identification]) {
      expect(isModuleIncluded(Base, mod)).toBe(true);
    }
  });

  it("finds its routes file through the config/routes.ts path", async () => {
    const routes = await Engine.config.paths().get("config/routes.ts")!.existent();
    expect(routes).toEqual([`${import.meta.dirname}/config/routes.ts`]);
  });

  it("hands its routes file to the application's routes reloader", async () => {
    const initializer = TrailsEngine.initializers.find((i) => i.name === "add_routing_paths")!;
    await initializer.bind(Engine.instance()).run(app);
    expect(
      (app as unknown as { routesReloader(): { paths: string[] } }).routesReloader().paths,
    ).toContain(`${import.meta.dirname}/config/routes.ts`);
  });

  it("draws nothing when draw_routes is false", async () => {
    const routes = TopLevel.Trails!.application!.routes() as unknown as RouteSet;
    const before = routes.routes.length;
    ActiveStorage.drawRoutes = false;
    try {
      // @ts-expect-error a query string forces a fresh evaluation
      await import("./config/routes.js?draw_routes=false");
    } finally {
      ActiveStorage.drawRoutes = true;
    }
    expect(routes.routes.length).toBe(before);
  });

  it("replays active_storage_reflection for a class loaded after the hook fired", () => {
    const late = vi.fn();
    onLoad("active_storage_reflection", late);
    expect(late).toHaveBeenCalledOnce();
  });

  it("attaches previewImage and image with no service argument", () => {
    expect(Blob.reflectOnAssociation("previewImageAttachment")).not.toBeNull();
    expect(VariantRecord.reflectOnAssociation("imageAttachment")).not.toBeNull();
  });

  it("raises when Blob loads with no storage configuration", async () => {
    const trails = TopLevel.Trails!;
    const activeStorage = (
      trails.configuration as unknown as { activeStorage: { serviceConfigurations?: unknown } }
    ).activeStorage;
    const configs = activeStorage.serviceConfigurations;
    const root = vi.spyOn(trails, "root").mockReturnValue("/nonexistent-trails-root");
    activeStorage.serviceConfigurations = undefined;
    try {
      const initializer = Engine.initializers.find((i) => i.name === "active_storage.services")!;
      const error = await Promise.resolve()
        .then(() => initializer.bind(Engine.instance()).run(app))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as Error).message).toBe(
        "Couldn't find Active Storage configuration in /nonexistent-trails-root/config/storage.ts",
      );
      expect(() => runLoadHooks("active_storage_blob", Blob)).toThrow(RuntimeError);
    } finally {
      root.mockRestore();
      activeStorage.serviceConfigurations = configs;
    }
  });

  it("does not load Blob when the engine loads", async () => {
    vi.resetModules();
    const { ActiveStorage: fresh } = await import("./active-storage.js");
    await import("./engine.js");
    expect(fresh.Blob).toBeUndefined();
  });

  it("seats the engine's models and controllers before the application's autoloader", async () => {
    vi.resetModules();
    const { ActiveStorage: fresh } = await import("./active-storage.js");
    const { Engine: freshEngine } = await import("./engine.js");
    const initializer = freshEngine.initializers.find((i) => i.name === "active_storage.app")!;
    expect(initializer.before).toBe("setup_main_autoloader");
    await initializer.bind(freshEngine.instance()).run(app);
    expect(fresh.Blob).toBeDefined();
    expect(fresh.Attachment).toBeDefined();
    expect(fresh.VariantRecord).toBeDefined();
    expect(fresh.Representations.RedirectController).toBeDefined();
    expect(fresh.Representations.ProxyController).toBeDefined();
    expect(
      (constantize("ActiveStorage::Representations::RedirectController") as { name: string }).name,
    ).toBe("RedirectController");
  });
});
