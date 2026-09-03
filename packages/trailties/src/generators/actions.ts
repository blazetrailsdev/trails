import { getChildProcess } from "@blazetrails/activesupport";
import { env as processEnv } from "@blazetrails/ruby-compat";

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
  return executeCommand.call(this, "rake", command, options);
}

/** @missingRailsCall run — PERMANENT */
export function executeCommand(
  this: ActionsHost,
  executor: string,
  command: string,
  options: RakeOptions = {},
): string | undefined {
  const envName = options.env ?? processEnv.TRAILS_ENV ?? processEnv.RAILS_ENV ?? "development";
  const parts: string[] = [];
  if (options.sudo) parts.push("sudo");
  parts.push(executor, ...splitArgs(command));
  const [bin, ...args] = parts;
  this.output(`          ${executor}  ${command}`);
  const result = getChildProcess().spawnSync(bin, args, {
    cwd: this.cwd,
    env: { ...processEnv, TRAILS_ENV: envName, RAILS_ENV: envName } as NodeJS.ProcessEnv,
  });
  if (options.abortOnFailure && (result.status !== 0 || result.error)) {
    const detail = result.error
      ? `: ${result.error.message}`
      : result.signal
        ? ` signal ${result.signal}`
        : ` exit status ${result.status}`;
    throw new Error(`${executor} ${command} aborted${detail}`);
  }
  if (options.capture) return result.stdout;
  return undefined;
}

function splitArgs(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}
