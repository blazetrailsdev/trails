/** @internal */

export class AbstractControllerError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AbstractControllerError";
  }
}
