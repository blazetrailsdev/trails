import { ActionController, Mime, MimeType } from "@blazetrails/actionpack";
import { OrderedOptions, TopLevel, onLoad } from "@blazetrails/activesupport";
import "@blazetrails/trailties/trailties/action-controller";
import type { Application } from "@blazetrails/trailties";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { File } from "@blazetrails/ruby-compat";
import { Turbo } from "./turbo-trails.js";
import "./app/channels/turbo/streams-channel.js";
import "./app/helpers/turbo/drive-helper.js";
import "./app/helpers/turbo/frames-helper.js";
import "./app/helpers/turbo/includes-helper.js";
import "./app/helpers/turbo/streams-helper.js";
import "./app/helpers/turbo/streams/action-helper.js";

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
type RendererHost = { mediaType: string | null; contentType: string | null };

export class Engine extends TrailsEngine {
  static readonly PRECOMPILE_ASSETS = ["turbo.js", "turbo.min.js", "turbo.min.js.map"];

  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(Turbo);
    this.config.eagerLoadNamespaces.push(Turbo);
    this.config.set("turbo", new OrderedOptions());
    this.config.turbo.testConnectAfterActions = ["visit"];

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
        this.helper(helpers);
      });
    });

    this.initializer("turbo.mimetype", () => {
      MimeType.register("text/vnd.turbo-stream.html", "turbo_stream");
    });

    this.initializer("turbo.renderer", () => {
      ActionController.Renderers.add(
        "turbo_stream",
        function (this: RendererHost, turboStreamsHtml: unknown, _options: unknown) {
          if (this.mediaType == null) this.contentType = Mime.get("turbo_stream")!.toString();
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
  }
}
Turbo.Engine = Engine;
