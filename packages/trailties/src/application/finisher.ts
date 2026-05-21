/**
 * Port of `Rails::Application::Finisher` from
 * `railties/lib/rails/application/finisher.rb`. Defines the finisher
 * initializers that run after the Trailtie + bootstrap initializers.
 *
 * Application (PR 2.5) will splice these into its initializer chain via
 * `initializersChain()`. Until then this class stands alone so tests can
 * exercise the declarations and block bodies against a mock host.
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
import type { ConfigurationBlock } from "../trailtie/configuration.js";

export interface FinisherRoutes {
  prepend(block: () => void): void;
  defineMountedHelper(name: string): void;
}

export interface FinisherReloader {
  toPrepare(block: ConfigurationBlock): void;
  prepareBang(): void;
}

export interface FinisherConfig {
  toPrepareBlocks: ConfigurationBlock[];
}

export interface FinisherEnv {
  isDevelopment(): boolean;
}

export interface FinisherHost {
  config: FinisherConfig;
  routes: FinisherRoutes;
  reloader: FinisherReloader;
  env: FinisherEnv;
  ensureGeneratorTemplatesAdded(): void;
  buildMiddlewareStack(): void;
  appendInternalRoute(verb: string, path: string, to: string): void;
}

export class Finisher extends Initializable {}

Finisher.initializer("add_generator_templates", function (this: FinisherHost) {
  this.ensureGeneratorTemplatesAdded();
});

Finisher.initializer("add_internal_routes", function (this: FinisherHost) {
  if (!this.env.isDevelopment()) return;
  this.routes.prepend(() => {
    this.appendInternalRoute("get", "/rails/info/properties", "rails/info#properties");
    this.appendInternalRoute("get", "/rails/info/routes", "rails/info#routes");
    this.appendInternalRoute("get", "/rails/info/notes", "rails/info#notes");
    this.appendInternalRoute("get", "/rails/info", "rails/info#index");
  });
});

Finisher.initializer("build_middleware_stack", function (this: FinisherHost) {
  this.buildMiddlewareStack();
});

Finisher.initializer("define_main_app_helper", function (this: FinisherHost) {
  this.routes.defineMountedHelper("main_app");
});

Finisher.initializer("add_to_prepare_blocks", function (this: FinisherHost) {
  for (const block of this.config.toPrepareBlocks) {
    this.reloader.toPrepare(block);
  }
});

Finisher.initializer("run_prepare_callbacks", function (this: FinisherHost) {
  this.reloader.prepareBang();
});
