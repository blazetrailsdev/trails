/**
 * AbstractController::ActionNotFound
 *
 * Raised when an action cannot be found for the given controller.
 * @see https://api.rubyonrails.org/classes/AbstractController/ActionNotFound.html
 */

export class ActionNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionNotFound";
  }
}
