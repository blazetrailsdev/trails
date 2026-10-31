import { rbObjId } from "@blazetrails/ruby-compat";

export const NOT_SET: object = Object.freeze({});

export class Promise<T = unknown> {
  /** @internal */ _mutex: globalThis.Promise<void> | null = null;
  /** @internal */ _result: T | object = NOT_SET;
  /** @internal */ _error: unknown = NOT_SET;
  /** @internal */ _args: unknown[] | null;
  /** @internal */ _block: ((...args: unknown[]) => T | globalThis.Promise<T>) | null;
  recorder: ((event: string, data: object) => void) | null = null;

  constructor(args: unknown[], block: (...args: unknown[]) => T | globalThis.Promise<T>) {
    this._args = args;
    this._block = block;
  }

  async value(): globalThis.Promise<T> {
    if (!this.isComplete()) {
      this.stat("sleeping_on", { item_id: rbObjId(this) });
      while (this._mutex != null) await this._mutex;
      this.stat("has_lock_on", { item_id: rbObjId(this) });
      this._mutex = this.chore().finally(() => {
        this._mutex = null;
      });
      await this._mutex;
      this.stat("releasing_lock_on", { item_id: rbObjId(this) });
    }
    if (this.isError()) throw this._error;
    return this._result as T;
  }

  async work(): globalThis.Promise<void> {
    this.stat("attempting_lock_on", { item_id: rbObjId(this) });
    if (this._mutex == null) {
      this.stat("has_lock_on", { item_id: rbObjId(this) });
      this._mutex = this.chore().finally(() => {
        this._mutex = null;
      });
      await this._mutex;
      this.stat("releasing_lock_on", { item_id: rbObjId(this) });
    } else {
      this.stat("bailed_on", { item_id: rbObjId(this) });
    }
  }

  /** @internal */
  private async chore(): globalThis.Promise<void> {
    if (this.isComplete()) {
      this.stat("found_completed", { item_id: rbObjId(this) });
      return;
    }
    this.stat("will_execute", { item_id: rbObjId(this) });
    try {
      this._result = await this._block!(...this._args!);
    } catch (e) {
      this._error = e;
    }
    this.stat("did_execute", { item_id: rbObjId(this) });
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
  private stat(event: string, data: object): void {
    if (this.recorder != null) this.recorder(event, data);
  }
}
