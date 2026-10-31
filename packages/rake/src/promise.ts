export const NOT_SET: object = Object.freeze({});

export class Promise<T = unknown> {
  /** @internal */ _mutex: globalThis.Promise<void> | null = null;
  /** @internal */ _result: T | object = NOT_SET;
  /** @internal */ _error: unknown = NOT_SET;
  /** @internal */ _args: unknown[] | null;
  /** @internal */ _block: ((...args: unknown[]) => T | globalThis.Promise<T>) | null;

  constructor(args: unknown[], block: (...args: unknown[]) => T | globalThis.Promise<T>) {
    this._args = args;
    this._block = block;
  }

  async value(): globalThis.Promise<T> {
    if (!this.isComplete()) {
      while (this._mutex != null) await this._mutex;
      this._mutex = this.chore().finally(() => {
        this._mutex = null;
      });
      await this._mutex;
    }
    if (this.isError()) throw this._error;
    return this._result as T;
  }

  async work(): globalThis.Promise<void> {
    if (this._mutex == null) {
      this._mutex = this.chore().finally(() => {
        this._mutex = null;
      });
      await this._mutex;
    }
  }

  /** @internal */
  private async chore(): globalThis.Promise<void> {
    if (this.isComplete()) return;
    try {
      this._result = await this._block!(...this._args!);
    } catch (e) {
      this._error = e;
    }
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
}
