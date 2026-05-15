/**
 * AbstractController::Error
 *
 * Base error class for AbstractController errors.
 * @internal
 * @see https://api.rubyonrails.org/classes/AbstractController/Error.html
 */

export class AbstractControllerError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AbstractControllerError";
  }
}
