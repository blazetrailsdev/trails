import { resetLoadHooks, runLoadHooks, TopLevel } from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Codec } from "@blazetrails/activesupport/messages/codec";
import { SerializerWithFallback } from "@blazetrails/activesupport/messages/serializer-with-fallback";
import { LoadError, verbose } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bootstrap, type BootstrapConfig, type BootstrapHost } from "./application/bootstrap.js";
import { Trails } from "./rails.js";
import { runTrailtieInitializers } from "./support/trailtie-initializers.js";
import { Trailtie as ActionDispatchTrailtie } from "./trailties/action-dispatch.js";
import { Trailtie as ActiveSupportTrailtie } from "./trailties/active-support.js";

class TestApp extends Bootstrap implements BootstrapHost {
  config: BootstrapConfig = { activeSupport: {} };
}

const MESSAGE_PACK = "active_support/message_pack";

describe("active_support/message_pack is awaited at boot", () => {
  const ActiveSupport = TopLevel.ActiveSupport!;
  const load = ActiveSupport.loadPath[MESSAGE_PACK];
  const defaultSerializer = Codec.defaultSerializer;
  let verboseAtLoad: unknown[];
  let savedActiveSupport: unknown;
  let savedActionDispatch: unknown;

  beforeEach(() => {
    resetLoadHooks();
    Trails.cache = null;
    verboseAtLoad = [];
    savedActiveSupport = ActiveSupportTrailtie.config.get("activeSupport");
    savedActionDispatch = ActionDispatchTrailtie.config.get("actionDispatch");
    ActiveSupport.loadPath[MESSAGE_PACK] = async () => {
      verboseAtLoad.push(verbose());
      throw new LoadError("cannot load such file -- msgpack");
    };
  });

  afterEach(() => {
    resetLoadHooks();
    Trails.cache = null;
    ActiveSupport.loadPath[MESSAGE_PACK] = load;
    Codec.defaultSerializer = defaultSerializer;
    ActiveSupportTrailtie.config.set("activeSupport", savedActiveSupport);
    ActionDispatchTrailtie.config.set("actionDispatch", savedActionDispatch);
  });

  const app = () => ({ config: ActiveSupportTrailtie.config, deprecators: new Map() });

  it("boots with the peer absent, attempting the load with warnings silenced", async () => {
    expect(ActiveSupport.MessagePack).toBeUndefined();
    await new TestApp().runInitializers("all");
    expect(verboseAtLoad).toEqual([null]);
    expect(verbose()).not.toBeNull();
    expect(() => SerializerWithFallback.get("message_pack")).toThrow(LoadError);
  });

  it("raises LoadError with warnings on when the cache store names message_pack and the peer is absent", async () => {
    const testApp = new TestApp();
    testApp.config = {
      activeSupport: {},
      cacheStore: [":memory_store", { serializer: ":message_pack" }],
    };
    await expect(testApp.runInitializers("all")).rejects.toThrow(LoadError);
    expect(verboseAtLoad[0]).toBeNull();
    expect(verboseAtLoad[1]).not.toBeNull();
  });

  it("raises LoadError when the message serializer names message_pack and the peer is absent", async () => {
    ActiveSupportTrailtie.config.set("activeSupport", { messageSerializer: ":message_pack" });
    await expect(runTrailtieInitializers(ActiveSupportTrailtie, app())).rejects.toThrow(LoadError);
  });

  it("raises LoadError when the cookies serializer names message_pack and the peer is absent", async () => {
    ActionDispatchTrailtie.config.set("actionDispatch", {
      ...(savedActionDispatch as object),
      cookiesSerializer: ":message_pack",
    });
    await expect(runTrailtieInitializers(ActionDispatchTrailtie, app())).rejects.toThrow(LoadError);
  });

  it("leaves the load alone for a json message serializer and cookies serializer", async () => {
    ActiveSupportTrailtie.config.set("activeSupport", { messageSerializer: ":json" });
    ActionDispatchTrailtie.config.set("actionDispatch", {
      ...(savedActionDispatch as object),
      cookiesSerializer: ":json",
    });
    await runTrailtieInitializers(ActiveSupportTrailtie, app());
    await runTrailtieInitializers(ActionDispatchTrailtie, app());
    expect(verboseAtLoad).toEqual([]);
  });

  it("seats ActiveSupport::MessagePack so a message_pack cache store builds and its payloads are detected", async () => {
    ActiveSupport.loadPath[MESSAGE_PACK] = load;
    const testApp = new TestApp();
    testApp.config = {
      activeSupport: {},
      cacheStore: [":memory_store", { serializer: ":message_pack" }],
    };
    await testApp.runInitializers("all");
    expect(ActiveSupport.MessagePack).toBeDefined();
    const dumped = SerializerWithFallback.get("message_pack").dump({ a: 1 });
    expect(SerializerWithFallback.get("json").load(dumped)).toEqual({ a: 1 });

    const verifier = new MessageVerifier("secret", { serializer: "message_pack" });
    expect(verifier.verify(verifier.generate({ a: 1 }))).toEqual({ a: 1 });

    ActiveSupportTrailtie.config.set("activeSupport", { messageSerializer: ":message_pack" });
    await runTrailtieInitializers(ActiveSupportTrailtie, app());
    await new TestApp().runInitializers("all");
    expect(TopLevel.ActiveSupport!.MessagePack).toBeDefined();
  });

  it("sets Codec.default_serializer from config.active_support.message_serializer after initialize", async () => {
    ActiveSupport.loadPath[MESSAGE_PACK] = load;
    ActiveSupportTrailtie.config.set("activeSupport", { messageSerializer: ":message_pack" });
    const railtieApp = app();
    await runTrailtieInitializers(ActiveSupportTrailtie, railtieApp);
    expect(Codec.defaultSerializer).toBe(defaultSerializer);
    runLoadHooks("after_initialize", railtieApp);
    expect(Codec.defaultSerializer).toBe("message_pack");
  });
});
