import { env as ENV, File, Gem, regexpEscape, Shellwords } from "@blazetrails/ruby-compat";
import { chomp, indent, stripHeredoc } from "@blazetrails/activesupport";
import { silenceWarnings } from "@blazetrails/activesupport/core-ext/kernel/reporting";
import { Trails } from "../rails.js";
import { run, type ActionsHost as ThorActionsHost } from "@blazetrails/thor/actions";
import { createFile } from "@blazetrails/thor/actions/create-file";
import { gsubFile } from "@blazetrails/thor/actions/file-manipulation";

export interface ActionsHost {
  options: { quiet?: boolean };
  behavior: "invoke" | "revoke";
  say(message: unknown, color?: string | null): void;
  sayStatus(status: unknown, message: unknown, logStatus?: string | boolean): void;
  inRoot<T>(block: () => T | Promise<T>): Promise<T>;
  injectIntoFile(destination: string, ...args: unknown[]): unknown;
  findInSourcePaths(file: string): Promise<string>;
}

export interface GeneratorActionsState {
  pendingGenerators: Array<{ what: string; args: string[] }>;
  afterInstallCallbacks: Array<() => void | Promise<void>>;
}

export interface EnvironmentOptions {
  env?: string | string[] | null;
}

export async function environment(
  this: ActionsHost,
  data: string | null = null,
  options: EnvironmentOptions = {},
  block?: () => string,
): Promise<void> {
  const sentinel = " extends Application {\n  static {\n";
  const envFileSentinel = "Trails.application.configure(function () {\n";
  if (block) data ??= block();

  await this.inRoot(async () => {
    if (options.env == null) {
      await this.injectIntoFile("config/application.ts", optimizeIndentation(data, 4), {
        after: sentinel,
        verbose: false,
      });
    } else {
      for (const env of ([] as string[]).concat(options.env)) {
        await this.injectIntoFile(`config/environments/${env}.ts`, optimizeIndentation(data, 2), {
          after: envFileSentinel,
          verbose: false,
        });
      }
    }
  });
}

export const application = environment;

export async function git(
  this: ActionsHost,
  commands: string | Record<string, string> = {},
): Promise<void> {
  if (typeof commands === "string") {
    await run.call(this as unknown as ThorActionsHost, `git ${commands}`);
  } else {
    for (const [cmd, options] of Object.entries(commands)) {
      await run.call(this as unknown as ThorActionsHost, `git ${cmd} ${options}`);
    }
  }
}

export async function vendor(
  this: ActionsHost,
  filename: string,
  data: string | null = null,
  block?: () => string,
): Promise<unknown> {
  log.call(this, "vendor", filename);
  if (block) data ??= block();
  return createFile.call(
    this as unknown as ThorActionsHost,
    `vendor/${filename}`,
    optimizeIndentation(data),
    { verbose: false },
  );
}

export async function lib(
  this: ActionsHost,
  filename: string,
  data: string | null = null,
  block?: () => string,
): Promise<unknown> {
  log.call(this, "lib", filename);
  if (block) data ??= block();
  return createFile.call(
    this as unknown as ThorActionsHost,
    `lib/${filename}`,
    optimizeIndentation(data),
    { verbose: false },
  );
}

export async function rakefile(
  this: ActionsHost,
  filename: string,
  data: string | null = null,
  block?: () => string,
): Promise<unknown> {
  log.call(this, "rakefile", filename);
  if (block) data ??= block();
  return createFile.call(
    this as unknown as ThorActionsHost,
    `lib/tasks/${filename}`,
    optimizeIndentation(data),
    { verbose: false },
  );
}

export async function initializer(
  this: ActionsHost,
  filename: string,
  data: string | null = null,
  block?: () => string,
): Promise<unknown> {
  log.call(this, "initializer", filename);
  if (block) data ??= block();
  return createFile.call(
    this as unknown as ThorActionsHost,
    `config/initializers/${filename}`,
    optimizeIndentation(data),
    {
      verbose: false,
    },
  );
}

/** @missingRailsCall rails_command — CONVERGEABLE converge-generators-actions-generate-onto-rails-command */
export function generate(
  this: ActionsHost & GeneratorActionsState,
  what: string,
  ...args: string[]
): void {
  log.call(this, "generate", what);
  this.pendingGenerators.push({ what, args });
}

export function afterInstall(
  this: GeneratorActionsState,
  callback: () => void | Promise<void>,
): void {
  this.afterInstallCallbacks.push(callback);
}

export interface RakeOptions {
  env?: string;
  sudo?: boolean;
  capture?: boolean;
  abortOnFailure?: boolean;
}

export function rake(
  this: ActionsHost,
  command: string,
  options: RakeOptions = {},
): Promise<string | boolean | null | undefined> {
  return executeCommand.call(this, "rake", command, options);
}

export interface RailsCommandOptions extends RakeOptions {
  inline?: boolean;
}

export async function railsCommand(
  this: ActionsHost,
  command: string,
  options: RailsCommandOptions = {},
): Promise<unknown> {
  if (options.inline) {
    log.call(this, "rails", command);
    let args: string[];
    [command, ...args] = Shellwords.shellwords(command);
    return await this.inRoot(() =>
      silenceWarnings(() => Trails.Command!.invoke(command, args, { ...options })),
    );
  } else {
    return await executeCommand.call(this, "rails", command, options);
  }
}

export interface RouteOptions {
  namespace?: string | string[] | null;
}

/**
 * @missingRailsArgs inject_into_file — PERMANENT
 * @missingRailsArgs match_file — PERMANENT
 */
export async function route(
  this: ActionsHost,
  routingCode: string,
  { namespace = null }: RouteOptions = {},
): Promise<void> {
  const namespaces = namespace == null ? [] : ([] as string[]).concat(namespace);
  let namespacePattern = routeNamespacePattern(namespaces);
  routingCode = [...namespaces]
    .reverse()
    .reduce(
      (code, name) =>
        `this.namespace(${JSON.stringify(name)}, () => {\n${rebaseIndentation(code, 2)}});`,
      routingCode,
    );

  log.call(this, "route", routingCode);

  await this.inRoot(async () => {
    const namespaceMatch = await matchFile("config/routes.ts", namespacePattern);
    if (namespaceMatch) {
      const captures = namespaceMatch
        .slice(1)
        .filter((c): c is string => c != null)
        .map((c) => c.length);
      const baseIndent = captures[0];
      const existingBlockIndent = captures.length > 1 ? captures.at(-1) : undefined;
      const existingLinePattern = new RegExp(
        `^[ ]{${existingBlockIndent == null ? "," : `0,${existingBlockIndent}`}}\\S.+\\n?`,
        "gm",
      );
      routingCode = rebaseIndentation(routingCode, baseIndent + 2).replace(existingLinePattern, "");
      namespacePattern = new RegExp(regexpEscape(namespaceMatch[0]));
    }

    await this.injectIntoFile("config/routes.ts", routingCode, {
      after: namespacePattern,
      verbose: false,
      force: false,
    });

    if (this.behavior === "revoke" && namespaces.length > 0 && namespaceMatch) {
      const emptyBlockPattern = new RegExp(
        `(${namespacePattern.source})((?:\\s*\\}\\);\\n){1,${namespaces.length}})`,
      );
      await gsubFile.call(
        this as unknown as ThorActionsHost,
        "config/routes.ts",
        emptyBlockPattern,
        { verbose: false, force: true },
        (matched: string) => {
          let [beginning, ending] = emptyBlockPattern.exec(matched)!.slice(1);
          let stripped: string;
          while (
            ending !== "" &&
            (stripped = beginning.replace(/^[ ]*this\.namespace\(.+ \{\n\s*(?![^])/m, "")) !==
              beginning
          ) {
            beginning = stripped;
            ending = ending.replace(/^\s*\}\);\n/, "");
          }
          return beginning + ending;
        },
      );
    }
  });
}

export async function readme(this: ActionsHost, path: string): Promise<void> {
  log.call(this, await File.readAsync(await this.findInSourcePaths(path)));
}

export function log(this: ActionsHost, ...args: unknown[]): void {
  if (args.length === 1) {
    if (!this.options.quiet) this.say(String(args[0]));
  } else {
    args.push(this.behavior === "invoke" ? "green" : "red");
    this.sayStatus(...(args as [unknown, unknown, string]));
  }
}

export function executeCommand(
  this: ActionsHost,
  executor: string,
  command: string,
  options: RakeOptions = {},
): Promise<string | boolean | null | undefined> {
  log.call(this, executor, command);
  const sudo = options.sudo && !Gem.isWinPlatform() ? "sudo " : "";
  const config = {
    env: { TRAILS_ENV: options.env || ENV.TRAILS_ENV || "development" },
    verbose: false,
    capture: options.capture,
    abortOnFailure: options.abortOnFailure,
  };
  return this.inRoot(() =>
    run.call(
      this as unknown as ThorActionsHost,
      `${sudo}${Shellwords.escape(Gem.ruby())} bin/${executor} ${command}`,
      config,
    ),
  );
}

/** @missingRailsArgs indent — PERMANENT */
export function optimizeIndentation(value: unknown, amount: number = 0): string {
  if (typeof value !== "string") return `${String(value ?? "")}\n`;
  return `${chomp(indent(stripHeredoc(value), amount))}\n`;
}

export const rebaseIndentation = optimizeIndentation;

/** @internal */
async function matchFile(path: string, pattern: RegExp): Promise<RegExpMatchArray | null> {
  if (await File.isExistAsync(path)) return (await File.readAsync(path)).match(pattern);
  return null;
}

/** @internal */
function routeNamespacePattern(namespace: string[]): RegExp {
  const pattern = namespace
    .map((name, i) => [name, i] as const)
    .reverse()
    .reduce<string | null>((pattern, [name, i]) => {
      const cumulativeMargin = `\\${i + 1}[ ]{2}`;
      const blankOrIndentedLine = `^[ ]*\\n|^${cumulativeMargin}.*\\n`;
      return `(?:(?:${blankOrIndentedLine})*?^(${cumulativeMargin})this\\.namespace\\(${regexpEscape(JSON.stringify(name))}, \\(\\) => \\{\\n${pattern ?? ""})?`;
    }, null);
  return new RegExp(
    `^([ ]*).+\\.routes\\(\\)\\.draw\\(function \\(\\) \\{[ ]*\\n${pattern ?? ""}`,
    "m",
  );
}
