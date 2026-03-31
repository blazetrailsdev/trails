/**
 * ActionController::RequestForgeryProtection
 *
 * CSRF protection error classes defined in the ActionController namespace.
 * These will be raised by the CSRF verification flow once fully wired;
 * currently the ActionDispatch verifier throws its own version.
 * @see https://api.rubyonrails.org/classes/ActionController/InvalidAuthenticityToken.html
 */

import { ActionControllerError } from "./exceptions.js";

export class InvalidAuthenticityToken extends ActionControllerError {
  constructor(message?: string) {
    super(message ?? "Invalid authenticity token");
    this.name = "InvalidAuthenticityToken";
  }
}

export class InvalidCrossOriginRequest extends ActionControllerError {
  constructor(message?: string) {
    super(message ?? "Invalid cross-origin request");
    this.name = "InvalidCrossOriginRequest";
  }
}
