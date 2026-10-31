import { rbObjId } from "@blazetrails/ruby-compat";

export const NOT_SET: object = Object.freeze({});

export class Promise<T = unknown> {
  /** @internal */ _mutex: globalThis.Promise<void> | null = null;
  /** @internal */ _result: T | object = NOT_SET;
  /** @internal */ _error: unknown = NOT_SET;
  /** @internal */ _args: unknown[] | null;
  /** @internal */ _block: ((...args: unknown[]) => T | globalThis.Promise<T>) | null;
  recorder: ((event: string, data: object, thread: object | null) => void) | null = null;

  constructor(args: unknown[], block: (...args: unknown[]) => T | globalThis.Promise<T>) {
    this._args = args;
    this._block = block;
  }

  async value(): globalThis.Promise<T> {
    if (!this.isComplete()) {
      this.stat("sleeping_on", { item_id: rbObjId(this) });
      while (this._mutex != null) await this._mutex;
      this.stat("has_lock_on", { item_id: rbObjId(this) });
      this._mutex = this.chore(null).finally(() => {
        this._mutex = null;
      });
      await this._mutex;
      this.stat("releasing_lock_on", { item_id: rbObjId(this) });
    }
    if (this.isError()) throw this._error;
    return this._result as T;
  }

  /** @missingRailsArgs work — PERMANENT */
  async work(thread: object | null = null): globalThis.Promise<void> {
    this.stat("attempting_lock_on", { item_id: rbObjId(this) }, thread);
    if (this._mutex == null) {
      this.stat("has_lock_on", { item_id: rbObjId(this) }, thread);
      this._mutex = this.chore(thread).finally(() => {
        this._mutex = null;
      });
      await this._mutex;
      this.stat("releasing_lock_on", { item_id: rbObjId(this) }, thread);
    } else {
      this.stat("bailed_on", { item_id: rbObjId(this) }, thread);
    }
  }

  /** @internal */
  private async chore(thread: object | null): globalThis.Promise<void> {
    if (this.isComplete()) {
      this.stat("found_completed", { item_id: rbObjId(this) }, thread);
      return;
    }
    this.stat("will_execute", { item_id: rbObjId(this) }, thread);
    try {
      this._result = await this._block!(...this._args!);
    } catch (e) {
      this._error = e;
    }
    this.stat("did_execute", { item_id: rbObjId(this) }, thread);
    this.discard();
  }

  /** @internal */
  private isResult(): boolean {
    return this._result !== NOT_SET;
  }

  /** @internal */
  private isError(): boolean {
    return this._error !== NOT_SET;
  }

  /** @internal */
  private isComplete(): boolean {
    return this.isResult() || this.isError();
  }

  /** @internal */
  private discard(): void {
    this._args = null;
    this._block = null;
  }

  /** @internal */
  private stat(event: string, data: object, thread: object | null = null): void {
    if (this.recorder != null) this.recorder(event, data, thread);
  }
}
