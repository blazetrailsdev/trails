/**
 * ActionController::Cookies
 *
 * Cookie access mixin for controllers. Delegates to request.cookie_jar.
 * @see https://api.rubyonrails.org/classes/ActionController/Cookies.html
 */

export function getCookies(request: { cookies?: Record<string, string> }): Record<string, string> {
  return request.cookies ?? {};
}
