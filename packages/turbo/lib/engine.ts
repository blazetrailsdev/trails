import { ActionController, ActionDispatch, Mime, MimeType } from "@blazetrails/actionpack";
import { OrderedOptions, TopLevel, include, onLoad } from "@blazetrails/activesupport";
import "@blazetrails/trailties/trailties/action-controller";
import { Trails, type Application } from "@blazetrails/trailties";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { File, constDefined } from "@blazetrails/ruby-compat";
import { Turbo } from "./turbo-trails.js";
import type { TestAssertions } from "./test-assertions.js";
import type { IntegrationTestAssertions } from "./test-assertions/integration-test-assertions.js";
import type { IdentityEncoder } from "@blazetrails/actionpack/testing";
import type { SystemTestHelper } from "./system-test-helper.js";
import type { TestHelper as BroadcastableTestHelper } from "./broadcastable/test-helper.js";
import "./app/channels/turbo/streams-channel.js";
import "./app/jobs/turbo/streams/action-broadcast-job.js";
import "./app/jobs/turbo/streams/broadcast-job.js";
import "./app/jobs/turbo/streams/broadcast-stream-job.js";
import "./app/helpers/turbo/drive-helper.js";
import "./app/helpers/turbo/frames-helper.js";
import "./app/helpers/turbo/includes-helper.js";
import { Broadcastable } from "./app/models/concerns/turbo/broadcastable.js";
import "./app/helpers/turbo/streams-helper.js";
import "./app/helpers/turbo/streams/action-helper.js";
import { RequestIdTracking } from "./app/controllers/concerns/turbo/request-id-tracking.js";
import { FrameRequest } from "./app/controllers/turbo/frames/frame-request.js";
import { Navigation } from "./app/controllers/turbo/native/navigation.js";
import "./app/controllers/turbo/native/navigation-controller.js";
import { ImmediateDebouncer } from "./app/models/turbo/immediate-debouncer.js";
import { ThreadDebouncer } from "./app/models/turbo/thread-debouncer.js";
import { TurboStreamsTagBuilder } from "./app/controllers/turbo/streams/turbo-streams-tag-builder.js";

declare module "@blazetrails/actionpack/testing" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace RequestEncoder {
    let TurboStreamEncoder: typeof IdentityEncoder | undefined;
  }
}

export interface TurboConfig extends OrderedOptions {
  testConnectAfterActions?: string[];
  drawRoutes?: boolean;
  signedStreamVerifierKey?: string | null;
}

declare module "@blazetrails/actionpack" {
  interface RenderOptions {
    turboStream?: unknown;
  }
}

declare module "@blazetrails/trailties/trailtie/configuration" {
  interface Configuration {
    turbo: TurboConfig;
  }
}

declare module "@blazetrails/ruby-compat" {
  interface TrailsConfiguration {
    turbo: TurboConfig;
  }
}

type HelperHost = { helper(...mods: object[]): void };
type RendererHost = { mediaType: string | null; contentType: MimeType | string | null };

export class Engine extends TrailsEngine {
  static readonly PRECOMPILE_ASSETS = ["turbo.js", "turbo.min.js", "turbo.min.js.map"];

  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(Turbo);
    this.config.eagerLoadNamespaces.push(Turbo);
    this.config.set("turbo", new OrderedOptions());
    this.config.turbo.testConnectAfterActions = ["visit"];

    this.config.paths().add("config/routes.ts", {
      with: File.join(import.meta.dirname, "config", `routes${File.extname(import.meta.filename)}`),
    });

    /** @inventedArm add — PERMANENT */
    this.config.paths().add("app/helpers", {
      with: File.join(import.meta.dirname, "app", "helpers"),
      eagerLoad: true,
    });

    this.config.autoloadOncePaths = [
      File.join(import.meta.dirname, "app", "channels"),
      File.join(import.meta.dirname, "app", "controllers"),
      File.join(import.meta.dirname, "app", "controllers", "concerns"),
      File.join(import.meta.dirname, "app", "helpers"),
      File.join(import.meta.dirname, "app", "models"),
      File.join(import.meta.dirname, "app", "models", "concerns"),
      File.join(import.meta.dirname, "app", "jobs"),
    ];

    this.initializer("turbo.no_active_job", { before: "set_eager_load_paths" }, () => {
      if (!constDefined(TopLevel, "ActiveJob")) {
        Trails.autoloaders.once.doNotEagerLoad(File.join(import.meta.dirname, "app", "jobs"));
      }
    });

    this.initializer("turbo.no_action_cable", { before: "set_eager_load_paths" }, () => {
      if (!constDefined(TopLevel, "ActionCable")) {
        Trails.autoloaders.once.doNotEagerLoad(File.join(import.meta.dirname, "app", "channels"));
      }
    });

    this.initializer("turbo.assets", () => {
      const config = TopLevel.Trails!.application!.config as unknown as {
        isRespondTo(name: string): boolean;
        get(name: string): unknown;
      };
      if (config.isRespondTo("assets")) {
        const assets = config.get("assets") as { precompile: string[] };
        assets.precompile = [...assets.precompile, ...Engine.PRECOMPILE_ASSETS];
      }
    });

    this.initializer("turbo.configs", () => {
      this.config.afterInitialize((app) => {
        Turbo.drawRoutes = app.config.turbo.drawRoutes !== false;
      });
    });

    /** @inventedArm await — PERMANENT */
    this.initializer("turbo.helpers", { before: "load_config_initializers" }, async () => {
      const helpers = await Engine.instance().helpers();
      onLoad("action_controller_base", function (this: HelperHost) {
        include(this, Navigation);
        include(this, FrameRequest);
        include(this, TurboStreamsTagBuilder);
        this.helper(helpers);
      });
    });

    this.initializer("turbo.request_id_tracking", () => {
      onLoad("action_controller", function (this: object) {
        include(this, RequestIdTracking);
      });
    });

    this.initializer("turbo.broadcastable", () => {
      onLoad("active_record", function (this: object) {
        if ("ActiveJob" in TopLevel) {
          include(this, Broadcastable);
        }
      });
    });

    this.initializer("turbo.mimetype", () => {
      MimeType.register("text/vnd.turbo-stream.html", ":turbo_stream");
    });

    this.initializer("turbo.renderer", () => {
      ActionController.Renderers.add(
        "turboStream",
        function (this: RendererHost, turboStreamsHtml: unknown) {
          if (this.mediaType == null) this.contentType = Mime.get("turbo_stream")!;
          return turboStreamsHtml;
        },
      );
    });

    this.initializer("turbo.signed_stream_verifier_key", () => {
      this.config.afterInitialize(() => {
        Turbo.setSignedStreamVerifierKey(
          this.config.turbo.signedStreamVerifierKey ??
            (TopLevel.Trails!.application as unknown as Application)
              .keyGenerator()
              .generateKey("turbo/signed_stream_verifier_key"),
        );
      });
    });

    /**
     * @inventedArm await — PERMANENT
     * @inventedArm if — PERMANENT
     */
    this.initializer("turbo.test_assertions", async () => {
      const testAssertions =
        TopLevel.ActiveSupport?.TestCase !== undefined
          ? (
              (await Turbo.loadPath["turbo/test_assertions"]()) as {
                TestAssertions: typeof TestAssertions;
              }
            ).TestAssertions
          : null;
      onLoad("active_support_test_case", function (this: object) {
        if (testAssertions !== null) include(this, testAssertions);

        ThreadDebouncer.debouncerClass = ImmediateDebouncer;
      });

      const testHelper =
        TopLevel.ActiveSupport?.TestCase !== undefined && constDefined(TopLevel, "ActiveJob")
          ? (
              (await Turbo.loadPath["turbo/broadcastable/test_helper"]()) as {
                TestHelper: typeof BroadcastableTestHelper;
              }
            ).TestHelper
          : null;
      onLoad("action_cable", () => {
        onLoad("active_support_test_case", function (this: object) {
          if (testHelper !== null) {
            include(this, testHelper);
          }
        });
      });

      const integrationTestAssertions =
        ActionDispatch.IntegrationTest !== undefined
          ? (
              (await Turbo.loadPath["turbo/test_assertions/integration_test_assertions"]()) as {
                IntegrationTestAssertions: typeof IntegrationTestAssertions;
              }
            ).IntegrationTestAssertions
          : null;
      onLoad("action_dispatch_integration_test", function (this: object) {
        if (integrationTestAssertions !== null) include(this, integrationTestAssertions);
      });
    });

    this.initializer("turbo.integration_test_request_encoding", () => {
      onLoad("action_dispatch_integration_test", () => {
        const RequestEncoder = ActionDispatch.RequestEncoder!;
        const header = [Mime.get("turbo_stream"), Mime.get("html")].join(",");
        class TurboStreamEncoder extends RequestEncoder.IdentityEncoder {
          override get acceptHeader(): string {
            return header;
          }
        }
        RequestEncoder.TurboStreamEncoder = TurboStreamEncoder;

        RequestEncoder.encoders.set(":turbo_stream", new TurboStreamEncoder());
      });
    });

    /** @inventedArm await — PERMANENT */
    this.initializer("turbo.system_test_helper", async () => {
      const { SystemTestHelper: systemTestHelper } = (await Turbo.loadPath[
        "turbo/system_test_helper"
      ]()) as { SystemTestHelper: typeof SystemTestHelper };
      onLoad("action_dispatch_system_test_case", function (this: object) {
        include(this, systemTestHelper);
      });
    });

    this.config.afterInitialize((app) => {
      onLoad("action_dispatch_system_test_case", function (this: { prototype: object }) {
        for (const method of app.config.turbo.testConnectAfterActions as string[]) {
          const prototype = this.prototype as Record<string, unknown>;
          const superMethod = prototype[method] as
            | ((this: unknown, ...args: unknown[]) => unknown)
            | undefined;
          prototype[method] = async function (
            this: { connectTurboCableStreamSources(): Promise<void> },
            ...args: unknown[]
          ) {
            const result = await superMethod!.apply(this, args);
            await this.connectTurboCableStreamSources();
            return result;
          };
        }
      });
    });
  }
}
Turbo.Engine = Engine;
