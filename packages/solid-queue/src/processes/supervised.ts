import { included, isPresent } from "@blazetrails/activesupport";
import { Process, classModule, onSignal, rbModAttrReader } from "@blazetrails/ruby-compat";

interface SupervisedHost {
  _supervisor: { pid: number } | null;
  supervisor: { pid: number } | null;
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
  registerSignalHandlers(this: SupervisedHost): void {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      onSignal(signal, () => {
        void this.stop();
      });
    }
  }
}
