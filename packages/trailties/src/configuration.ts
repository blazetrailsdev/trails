import type { MiddlewareStack } from "@blazetrails/actionpack";

type MiddlewareOperation = (middleware: any) => void;

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
    this._operations.push((middleware) => middleware.insertBefore(...args));
  }

  insert(...args: any[]): void {
    this.insertBefore(...args);
  }

  insertAfter(...args: any[]): void {
    this._operations.push((middleware) => middleware.insertAfter(...args));
  }

  swap(...args: any[]): void {
    this._operations.push((middleware) => middleware.swap(...args));
  }

  use(...args: any[]): void {
    this._operations.push((middleware) => middleware.use(...args));
  }

  delete(...args: any[]): void {
    this._deleteOperations.push((middleware) => middleware.delete(...args));
  }

  moveBefore(...args: any[]): void {
    this._deleteOperations.push((middleware) => middleware.moveBefore(...args));
  }

  move(...args: any[]): void {
    this.moveBefore(...args);
  }

  moveAfter(...args: any[]): void {
    this._deleteOperations.push((middleware) => middleware.moveAfter(...args));
  }

  unshift(...args: any[]): void {
    this._operations.push((middleware) => middleware.unshift(...args));
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
