// Mirrors railties/lib/rails/generators/actions.rb. PR 1.10 ports gem/route/
// environment/generate; PR 1.10b adds git/after_bundle/rake/add_source/etc.

export interface GemOptions {
  version?: string | string[];
  group?: string | string[];
  git?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface ActionsHost {
  cwd: string;
  output: (msg: string) => void;
  appendToFile(relativePath: string, content: string): void;
  insertIntoFile(relativePath: string, marker: string, content: string): void;
}

export interface GeneratorActionsState {
  pendingGenerators: Array<{ what: string; args: string[] }>;
}

function quote(value: unknown): string {
  if (typeof value === "string") return `"${value.replace(/'/g, '"')}"`;
  if (value === null) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(quote).join(", ")}]`;
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${quote(v)}`)
      .join(", ");
  }
  return String(value);
}

export function gem(this: ActionsHost, name: string, ...rest: Array<string | GemOptions>): void {
  let options: GemOptions = {};
  const versions: string[] = [];
  for (const arg of rest) {
    if (typeof arg === "string") versions.push(arg);
    else options = arg;
  }
  const comment = options.comment;
  const optsForOutput: Record<string, unknown> = { ...options };
  delete optsForOutput.comment;
  delete optsForOutput.version;

  const versionList =
    versions.length > 0
      ? versions
      : options.version === undefined
        ? []
        : Array.isArray(options.version)
          ? options.version
          : [options.version];

  const parts: string[] = [quote(name), ...versionList.map(quote)];
  if (Object.keys(optsForOutput).length > 0) parts.push(quote(optsForOutput));

  const lines: string[] = [];
  if (comment) for (const line of comment.split("\n")) lines.push(`# ${line}`);
  lines.push(`gem ${parts.join(", ")}`);

  this.output(`      gemfile  ${name}`);
  this.appendToFile("Gemfile", lines.join("\n") + "\n");
}

export function route(
  this: ActionsHost,
  routingCode: string,
  options: { namespace?: string | string[] } = {},
): void {
  const namespaces = options.namespace
    ? Array.isArray(options.namespace)
      ? options.namespace
      : [options.namespace]
    : [];
  let code = routingCode;
  for (const ns of [...namespaces].reverse()) {
    code = `namespace :${ns} do\n  ${code}\nend`;
  }
  this.output(`      route  ${routingCode}`);
  this.insertIntoFile("config/routes.rb", ".routes.draw do", code + "\n  ");
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
      : (Array.isArray(options.env) ? options.env : [options.env]).map(
          (e) => `config/environments/${e}.rb`,
        );
  for (const target of targets) {
    const marker = target.endsWith("application.rb")
      ? "class Application < Rails::Application\n"
      : "Rails.application.configure do\n";
    this.insertIntoFile(target, marker, `\n  ${data}\n`);
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
