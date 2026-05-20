// Mirrors railties/lib/rails/generators/actions.rb. PR 1.10 ports route/
// environment/generate; PR 1.10b adds git/after_bundle/rake/add_source/etc.
// `gem` / `gem_group` / `github` / `add_source` are unported: trails uses
// package.json, not a Gemfile, so the Ruby `gem "x"` DSL has no target.

export interface ActionsHost {
  output: (msg: string) => void;
  insertIntoFile(rel: string, marker: string, content: string, opts?: { after?: boolean }): void;
}

export interface GeneratorActionsState {
  pendingGenerators: Array<{ what: string; args: string[] }>;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function indent(text: string, pad: string): string {
  return text.replace(/^(?=.)/gm, pad);
}

export function route(
  this: ActionsHost,
  routingCode: string,
  options: { namespace?: string | string[] } = {},
): void {
  let code = routingCode;
  for (const ns of asArray(options.namespace).reverse()) {
    code = `namespace :${ns} do\n${indent(code, "  ")}\nend`;
  }
  this.output(`      route  ${routingCode}`);
  this.insertIntoFile("config/routes.rb", ".routes.draw do\n", indent(code, "  ") + "\n", {
    after: true,
  });
}

export function environment(
  this: ActionsHost,
  data: string,
  options: { env?: string | string[] } = {},
): void {
  this.output(`      environment  ${data.split("\n")[0]}`);
  const targets =
    options.env == null
      ? ["config/application.rb"]
      : asArray(options.env).map((e) => `config/environments/${e}.rb`);
  for (const target of targets) {
    const isApp = target.endsWith("application.rb");
    const marker = isApp
      ? "class Application < Rails::Application\n"
      : "Rails.application.configure do\n";
    this.insertIntoFile(target, marker, indent(data, isApp ? "    " : "  ") + "\n", {
      after: true,
    });
  }
}

export function generate(
  this: ActionsHost & GeneratorActionsState,
  what: string,
  ...args: string[]
): void {
  this.output(`      generate  ${what}`);
  this.pendingGenerators ??= [];
  this.pendingGenerators.push({ what, args });
}
