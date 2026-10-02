import {
  env,
  initialize,
  Module,
  RbConfig,
  rbConstGet,
  rbEnsure,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Basic } from "./shell/basic.js";
import { Color } from "./shell/color.js";

type ShellClass = new () => Basic;

export const Base = {
  /** @internal */
  _shell: null as ShellClass | null | undefined,

  set shell(shell: ShellClass | null) {
    this._shell = shell;
  },

  get shell(): ShellClass | undefined {
    if (this._shell == null) {
      if (env["THOR_SHELL"] != null && env["THOR_SHELL"] !== "") {
        this._shell = rbConstGet(Shell, env["THOR_SHELL"]) as ShellClass;
      } else if (/mswin|mingw/.test(RbConfig.CONFIG["host_os"]) && env["ANSICON"] == null) {
        this._shell = Shell.Basic;
      } else {
        this._shell = Shell.Color;
      }
    }
    return this._shell;
  },
};

type Delegated = Record<string, (...args: unknown[]) => unknown>;

export interface Shell {
  /** @internal */
  _shell?: Basic | null;
  shell: Basic;
  ask: OmitThisParameter<typeof ask>;
  error: OmitThisParameter<typeof error>;
  setColor: OmitThisParameter<typeof setColor>;
  isYes: OmitThisParameter<typeof isYes>;
  isNo: OmitThisParameter<typeof isNo>;
  say: OmitThisParameter<typeof say>;
  sayError: OmitThisParameter<typeof sayError>;
  sayStatus: OmitThisParameter<typeof sayStatus>;
  printInColumns: OmitThisParameter<typeof printInColumns>;
  printTable: OmitThisParameter<typeof printTable>;
  printWrapped: OmitThisParameter<typeof printWrapped>;
  fileCollision: OmitThisParameter<typeof fileCollision>;
  terminalWidth: OmitThisParameter<typeof terminalWidth>;
  withPadding: OmitThisParameter<typeof withPadding>;
}

const SHELL_DELEGATED_METHODS = [
  "ask",
  "error",
  "setColor",
  "isYes",
  "isNo",
  "say",
  "sayError",
  "sayStatus",
  "printInColumns",
  "printTable",
  "printWrapped",
  "fileCollision",
  "terminalWidth",
];

function setShell(this: Shell, shell: Basic | null | undefined): void {
  this._shell = shell;
}

function shell(this: Shell): Basic {
  return (this._shell ??= new Base.shell!());
}

function ask(this: Shell, ...args: Parameters<Basic["ask"]>): ReturnType<Basic["ask"]> {
  return this.shell.ask(...args);
}

function error(this: Shell, ...args: Parameters<Basic["error"]>): void {
  return this.shell.error(...args);
}

function setColor(this: Shell, ...args: Parameters<Basic["setColor"]>): string {
  return this.shell.setColor(...args);
}

function isYes(this: Shell, ...args: Parameters<Basic["isYes"]>): ReturnType<Basic["isYes"]> {
  return this.shell.isYes(...args);
}

function isNo(this: Shell, ...args: Parameters<Basic["isNo"]>): ReturnType<Basic["isNo"]> {
  return this.shell.isNo(...args);
}

function say(this: Shell, ...args: Parameters<Basic["say"]>): void {
  return this.shell.say(...args);
}

function sayError(this: Shell, ...args: Parameters<Basic["sayError"]>): void {
  return this.shell.sayError(...args);
}

function sayStatus(this: Shell, ...args: Parameters<Basic["sayStatus"]>): void {
  return this.shell.sayStatus(...args);
}

function printInColumns(this: Shell, ...args: Parameters<Basic["printInColumns"]>): void {
  return this.shell.printInColumns(...args);
}

function printTable(this: Shell, ...args: Parameters<Basic["printTable"]>): void {
  return this.shell.printTable(...args);
}

function printWrapped(this: Shell, ...args: Parameters<Basic["printWrapped"]>): void {
  return this.shell.printWrapped(...args);
}

function fileCollision(this: Shell, ...args: unknown[]): unknown {
  return (this.shell as unknown as Delegated).fileCollision(...args);
}

function terminalWidth(this: Shell, ...args: unknown[]): unknown {
  return (this.shell as unknown as Delegated).terminalWidth(...args);
}

function withPadding<T>(this: Shell, block: () => T): T {
  this.shell.padding += 1;
  return rbEnsure(block, () => {
    this.shell.padding -= 1;
  });
}

/** @internal */
function _sharedConfiguration(this: Shell): Record<string, unknown> {
  return Object.assign(
    Shell.superMethod(this, "_sharedConfiguration")!() as Record<string, unknown>,
    { shell: this.shell },
  );
}

export const Shell = new Module((mod) => {
  Object.assign(mod, { SHELL_DELEGATED_METHODS, Basic, Color });

  (mod as unknown as Record<symbol, unknown>)[initialize] = function (
    this: Shell,
    args: unknown[] = [],
    options: unknown = {},
    config: { shell?: Basic | null } = {},
  ) {
    this.shell = config.shell as Basic;
    if (rbObjRespondTo(this.shell, "base")) this.shell.base ||= this as never;
  };

  mod.moduleEval((m) => {
    Object.defineProperty(m, "shell", { get: shell, set: setShell, configurable: true });
    Object.assign(m, {
      ask,
      error,
      setColor,
      isYes,
      isNo,
      say,
      sayError,
      sayStatus,
      printInColumns,
      printTable,
      printWrapped,
      fileCollision,
      terminalWidth,
      withPadding,
      _sharedConfiguration,
    });
  });
}) as Module & {
  SHELL_DELEGATED_METHODS: string[];
  Basic: typeof Basic;
  Color: typeof Color;
  HTML?: typeof Basic;
};
