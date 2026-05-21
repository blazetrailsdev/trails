// Mirrors railties/lib/rails/generators/actions.rb. Ports generate, git,
// rake, and after_install (Rails' after_bundle — renamed for the JS
// ecosystem; trails apps run a package-manager install, not `bundle`).
//
// Unported (no trails equivalent — Ruby-shape DSL emits Ruby-shape files
// that don't exist in a trails app):
//   gem, gem_group, github, add_source — trails uses package.json
//   route, environment, application      — trails uses src/config/*.ts

import { getChildProcess, env as processEnv } from "@blazetrails/activesupport";

export interface ActionsHost {
  cwd: string;
  output: (msg: string) => void;
}

export interface GeneratorActionsState {
  pendingGenerators: Array<{ what: string; args: string[] }>;
  afterInstallCallbacks: Array<() => void | Promise<void>>;
}

export function generate(
  this: ActionsHost & GeneratorActionsState,
  what: string,
  ...args: string[]
): void {
  this.output(`      generate  ${what}`);
  this.pendingGenerators.push({ what, args });
}

export function git(this: ActionsHost, commands: string | Record<string, string>): void {
  if (typeof commands === "string") {
    // String form is the whole subcommand line: `git("checkout -b foo")`
    // must spawn ["checkout", "-b", "foo"], not [<the whole string>].
    const parts = splitArgs(commands);
    runGitCommand(this, parts[0] ?? "", parts.slice(1));
  } else {
    for (const [cmd, options] of Object.entries(commands)) {
      runGitCommand(this, cmd, splitArgs(options));
    }
  }
}

function runGitCommand(host: ActionsHost, cmd: string, optionArgs: string[]): void {
  const args = [cmd, ...optionArgs];
  host.output(`           git  ${[cmd, ...optionArgs].join(" ").trim()}`);
  getChildProcess().spawnSync("git", args, { cwd: host.cwd });
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
): string | undefined {
  return executeCommand(this, "rake", command, options);
}

function executeCommand(
  host: ActionsHost,
  name: string,
  command: string,
  opts: RakeOptions,
): string | undefined {
  // Mirrors Rails' RAILS_ENV resolution but defaults from TRAILS_ENV
  // (the trailties runtime convention, see database.ts:resolveEnv). Set
  // both vars in the spawned env: TRAILS_ENV for trails children, plus
  // RAILS_ENV so a literal `rake` task that reads RAILS_ENV still works.
  const envName = opts.env ?? processEnv.TRAILS_ENV ?? processEnv.RAILS_ENV ?? "development";
  const parts: string[] = [];
  if (opts.sudo) parts.push("sudo");
  parts.push(name, ...splitArgs(command));
  const [bin, ...args] = parts;
  host.output(`          ${name}  ${command}`);
  const result = getChildProcess().spawnSync(bin, args, {
    cwd: host.cwd,
    env: { ...processEnv, TRAILS_ENV: envName, RAILS_ENV: envName } as NodeJS.ProcessEnv,
  });
  if (opts.abortOnFailure && (result.status !== 0 || result.error)) {
    const detail = result.error
      ? `: ${result.error.message}`
      : result.signal
        ? ` signal ${result.signal}`
        : ` exit status ${result.status}`;
    throw new Error(`${name} ${command} aborted${detail}`);
  }
  if (opts.capture) return result.stdout;
  return undefined;
}

function splitArgs(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}
