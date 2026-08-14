/**
 * Port of `Rails::Application::Finisher` from
 * `railties/lib/rails/application/finisher.rb`. Defines the finisher
 * initializers that run after the Trailtie + bootstrap initializers.
 *
 * `Application#initializers` splices these in after the Bootstrap and
 * Trailtie/Engine initializers, mirroring `application.rb:445-449`.
 *
 * Rails blocks of the form `initializer :foo do |app|` get the
 * Application instance both as `self` and as the block argument. In our
 * port, `Initializable` binds each initializer to its host via
 * `bind(context)` before calling `block.apply(context, args)`, so `this`
 * is already the host. The blocks here use `this: FinisherHost` and
 * skip the redundant argument.
 *
 * The Rails initializers tied to Zeitwerk, eager loading, the
 * reloader/executor concurrency hooks, default session store, the
 * routes-reloader hook, dependency clearing, and YJIT are intentionally
 * not ported here — they depend on subsystems we don't have or are out
 * of scope per the trailties plan.
 */
import { Initializable } from "../initializable.js";
import { Trails } from "../rails.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { DrawCallback } from "@blazetrails/actionpack";

export interface FinisherRoutes {
  prepend(block: DrawCallback): void;
  defineMountedHelper(name: string): void;
}

export interface FinisherReloader {
  toPrepare(block: ConfigurationBlock): void;
  prepareBang(): void;
}

export interface FinisherConfig {
  toPrepareBlocks: ConfigurationBlock[];
}

export interface FinisherHost {
  config: FinisherConfig;
  routes(): FinisherRoutes;
  reloader: FinisherReloader;
  ensureGeneratorTemplatesAdded(): void;
  buildMiddlewareStack(): void;
}

export class Finisher extends Initializable {}

Finisher.initializer("add_generator_templates", function (this: FinisherHost) {
  this.ensureGeneratorTemplatesAdded();
});

Finisher.initializer("add_internal_routes", function (this: FinisherHost) {
  // `Trails.env` is an `EnvironmentInquirer`, whose per-environment
  // predicates are Proxy-generated (`string-inquirer.ts:12-28`) and so are
  // absent from its static type; Rails reads `Rails.env.development?`.
  if (!(Trails.env as unknown as { isDevelopment(): boolean }).isDevelopment()) return;
  this.routes().prepend((mapper) => {
    mapper.get("/rails/info/properties", "rails/info#properties");
    mapper.get("/rails/info/routes", "rails/info#routes");
    mapper.get("/rails/info/notes", "rails/info#notes");
    mapper.get("/rails/info", "rails/info#index");
  });
});

Finisher.initializer("build_middleware_stack", function (this: FinisherHost) {
  this.buildMiddlewareStack();
});

Finisher.initializer("define_main_app_helper", function (this: FinisherHost) {
  this.routes().defineMountedHelper("main_app");
});

Finisher.initializer("add_to_prepare_blocks", function (this: FinisherHost) {
  for (const block of this.config.toPrepareBlocks) {
    this.reloader.toPrepare(block);
  }
});

Finisher.initializer("run_prepare_callbacks", function (this: FinisherHost) {
  this.reloader.prepareBang();
});
