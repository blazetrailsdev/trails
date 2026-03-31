/**
 * ActionController::Redirecting
 *
 * UnsafeRedirectError raised when a redirect URL is not considered safe.
 * The redirect_to/redirect_back methods live in Base.
 * @see https://api.rubyonrails.org/classes/ActionController/Redirecting.html
 */

export class UnsafeRedirectError extends Error {
  constructor(message?: string) {
    super(message ?? "Unsafe redirect");
    this.name = "UnsafeRedirectError";
  }
}
