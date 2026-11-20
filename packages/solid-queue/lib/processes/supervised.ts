import { TopLevel, included, isPresent } from "@blazetrails/activesupport";
import {
  Process,
  type PipeIO,
  Thread,
  classModule,
  exitBang,
  onSignal,
  rbFFork,
  rbModAttrReader,
} from "@blazetrails/ruby-compat";

interface SupervisedHost {
  name: string;
  _supervisor: { id?: unknown; pid: number } | null;
  supervisor: { id?: unknown; pid: number } | null;
  _bootGuard: object;
  _configuredProcess?: { kind: string; attributes: unknown };
  stop(): unknown;
  procline(string: string): void;
  isSupervised(): boolean;
}

export class Supervised {
  static readonly [classModule] = true;

  static [included](base: object): void {
    rbModAttrReader(base as never, "supervisor");
  }

  supervisedBy(this: SupervisedHost, process: { pid: number }): void {
    this._supervisor = process;
  }

  /** @internal */
  setProcline(this: SupervisedHost): void {
    this.procline("waiting");
  }

  /** @internal */
  isSupervisorWentAway(this: SupervisedHost): boolean {
    return this.isSupervised() && this.supervisor!.pid !== Process.ppid;
  }

  /** @internal */
  isSupervised(this: SupervisedHost): boolean {
    return isPresent(this.supervisor);
  }

  /** @internal */
  createFork(this: SupervisedHost, _block: () => Promise<void>): number {
    return rbFFork(
      new URL("./fork-entry.js", import.meta.url).pathname,
      {
        boot: `${TopLevel.Trails!.root()}/config/environment.ts`,
        configuredProcess: {
          kind: this._configuredProcess!.kind,
          attributes: this._configuredProcess!.attributes,
        },
        name: this.name,
        supervisorId: this.supervisor!.id,
      },
      [(this._bootGuard as unknown as { _writer: PipeIO })._writer],
    );
  }

  /** @internal */
  registerSignalHandlers(this: SupervisedHost): void {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      onSignal(signal, () => {
        new Thread(() => this.stop());
      });
    }

    onSignal("SIGQUIT", () => {
      exitBang();
    });
  }
}
