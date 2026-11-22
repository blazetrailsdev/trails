import { OrderedOptions, TopLevel, onLoad } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/active-record";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import "@blazetrails/activestorage/engine";
import { File, include, prepend, rbFRequire, rbClearMethodCache } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { Attachable } from "./attachable.js";
import { Attachment } from "./attachment.js";
import { Attribute } from "./attribute.js";
import { Content } from "./content.js";
import { ContentHelper } from "./app/helpers/action-text/content-helper.js";
import { Encryption } from "./encryption.js";
import "./app/helpers/action-text/tag-helper.js";
import "./deprecator.js";

export interface ActionTextConfig extends OrderedOptions {
  attachmentTagName?: string;
  sanitizerVendor?: { safeListSanitizer: new () => ContentHelper["sanitizer"] } | null;
}

declare module "@blazetrails/trailties/trailtie/configuration" {
  interface Configuration {
    actionText: ActionTextConfig;
  }
}

declare module "@blazetrails/ruby-compat" {
  interface TrailsConfiguration {
    actionText: ActionTextConfig;
  }
}

type BlobHost = {
  isRepresentable(): boolean;
  filename: unknown;
};

type HelperHost = { helper(...mods: object[]): void };
type AroundActionHost = {
  aroundAction(block: (controller: unknown, action: () => unknown) => unknown): void;
};

export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(ActionText);
    this.config.eagerLoadNamespaces.push(ActionText);

    this.config.paths().add("db/migrate", {
      with: File.join(import.meta.dirname, "db", "migrate"),
    });

    this.config.paths().add("lib/tasks", {
      with: File.join(import.meta.dirname, "tasks"),
      glob: `*${File.extname(import.meta.filename)}`,
    });

    /** @inventedArm add — PERMANENT */
    this.config.paths().add("app/helpers", {
      with: File.join(import.meta.dirname, "app", "helpers"),
      eagerLoad: true,
    });

    this.config.set("actionText", new OrderedOptions());
    this.config.actionText.attachmentTagName = "action-text-attachment";
    this.config.autoloadOncePaths = [
      File.join(import.meta.dirname, "app", "helpers"),
      File.join(import.meta.dirname, "app", "models"),
    ];

    this.initializer("action_text.deprecator", { before: "load_environment_config" }, (app) => {
      app.deprecators.set("actionText", ActionText.deprecator());
    });

    this.initializer("action_text.attribute", () => {
      onLoad("active_record", function (this: typeof Base) {
        include(this, Attribute);
        prepend(this, Encryption);
      });
    });

    this.initializer("action_text.asset", () => {
      const config = TopLevel.Trails!.application!.config as unknown as {
        isRespondTo(name: string): boolean;
        get(name: string): unknown;
      };
      if (config.isRespondTo("assets")) {
        const assets = config.get("assets") as { precompile: string[] };
        assets.precompile = [
          ...assets.precompile,
          "actiontext.js",
          "actiontext.esm.js",
          "trix.js",
          "trix.css",
        ];
      }
    });

    this.initializer("action_text.attachable", () => {
      onLoad("active_storage_blob", function (this: { prototype: object }) {
        include(this, Attachable);

        Object.defineProperty(this.prototype, "isPreviewableAttachable", {
          value: function (this: BlobHost): boolean {
            return this.isRepresentable();
          },
          writable: true,
          configurable: true,
        });
        rbClearMethodCache();

        Object.defineProperty(this.prototype, "attachablePlainTextRepresentation", {
          value: function (this: BlobHost, caption: unknown = null): string {
            return `[${String(caption ?? this.filename)}]`;
          },
          writable: true,
          configurable: true,
        });
        rbClearMethodCache();

        Object.defineProperty(this.prototype, "toTrixContentAttachmentPartialPath", {
          value: function (): null {
            return null;
          },
          writable: true,
          configurable: true,
        });
        rbClearMethodCache();
      });
    });

    /** @inventedArm await — PERMANENT */
    this.initializer("action_text.helper", async () => {
      const helpers = await Engine.instance().helpers();
      for (const base of ["action_controller_base", "action_mailer"]) {
        onLoad(base, function (this: HelperHost) {
          this.helper(helpers);
        });
      }
    });

    this.initializer("action_text.renderer", () => {
      for (const base of ["action_controller_base", "action_mailer"]) {
        onLoad(base, function (this: AroundActionHost) {
          this.aroundAction((controller, action) =>
            Content.withRenderer(controller as never, action),
          );
        });
      }
    });

    this.initializer("action_text.system_test_helper", async () => {
      await rbFRequire(ActionText.loadPath, "action_text/system_test_helper");
      onLoad("action_dispatch_system_test_case", function (this: object) {
        include(this, ActionText.SystemTestHelper!);
      });
    });

    this.initializer("action_text.configure", (app) => {
      Attachment.tagName = app.config.actionText.attachmentTagName!;
    });

    this.config.afterInitialize((app) => {
      const klass = app.config.actionText.sanitizerVendor;
      if (klass != null) {
        ContentHelper.sanitizer = new klass.safeListSanitizer();
      }
    });
  }
}

ActionText.Engine = Engine;
