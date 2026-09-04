import type { MiddlewareStack } from "@blazetrails/actionpack";

type MiddlewareOperation = (middleware: MiddlewareStack) => void;

export class MiddlewareStackProxy {
  private _operations: MiddlewareOperation[];
  private _deleteOperations: MiddlewareOperation[];

  constructor(
    operations: MiddlewareOperation[] = [],
    deleteOperations: MiddlewareOperation[] = [],
  ) {
    this._operations = operations;
    this._deleteOperations = deleteOperations;
  }

  insertBefore(...args: any[]): void {
    this._operations.push((middleware) =>
      (middleware.insertBefore as (...a: any[]) => void)(...args),
    );
  }

  insert(...args: any[]): void {
    this.insertBefore(...args);
  }

  insertAfter(...args: any[]): void {
    this._operations.push((middleware) =>
      (middleware.insertAfter as (...a: any[]) => void)(...args),
    );
  }

  swap(...args: any[]): void {
    this._operations.push((middleware) => (middleware.swap as (...a: any[]) => void)(...args));
  }

  use(...args: any[]): void {
    this._operations.push((middleware) => (middleware.use as (...a: any[]) => void)(...args));
  }

  delete(...args: any[]): void {
    this._deleteOperations.push((middleware) =>
      (middleware.delete as (...a: any[]) => void)(...args),
    );
  }

  moveBefore(...args: any[]): void {
    this._deleteOperations.push((middleware) =>
      (middleware.moveBefore as (...a: any[]) => void)(...args),
    );
  }

  move(...args: any[]): void {
    this.moveBefore(...args);
  }

  moveAfter(...args: any[]): void {
    this._deleteOperations.push((middleware) =>
      (middleware.moveAfter as (...a: any[]) => void)(...args),
    );
  }

  unshift(...args: any[]): void {
    this._operations.push((middleware) => (middleware.unshift as (...a: any[]) => void)(...args));
  }

  mergeInto(other: MiddlewareStack): MiddlewareStack {
    for (const operation of [...this._operations, ...this._deleteOperations]) {
      operation(other);
    }

    return other;
  }

  plus(other: MiddlewareStackProxy): MiddlewareStackProxy {
    return new MiddlewareStackProxy(
      [...this._operations, ...other.operations],
      [...this._deleteOperations, ...other.deleteOperations],
    );
  }

  protected get operations(): MiddlewareOperation[] {
    return this._operations;
  }

  protected get deleteOperations(): MiddlewareOperation[] {
    return this._deleteOperations;
  }
}
