import { ActionController, Mime, MimeType } from "@blazetrails/actionpack";
import { OrderedOptions, TopLevel, include, onLoad } from "@blazetrails/activesupport";
import "@blazetrails/trailties/trailties/action-controller";
import { Trails, type Application } from "@blazetrails/trailties";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { File, constDefined } from "@blazetrails/ruby-compat";
import { Turbo } from "./turbo-trails.js";
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

export interface TurboConfig extends OrderedOptions {
  testConnectAfterActions?: string[];
  drawRoutes?: boolean;
  signedStreamVerifierKey?: string | null;
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
        "turbo_stream",
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

    /** @missingRailsCall include — CONVERGEABLE turbo-test-helpers */
    this.initializer("turbo.test_assertions", () => {
      onLoad("active_support_test_case", () => {
        ThreadDebouncer.debouncerClass = ImmediateDebouncer;
      });
    });
  }
}
Turbo.Engine = Engine;
