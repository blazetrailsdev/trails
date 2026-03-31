/**
 * ActionController::HttpAuthentication
 *
 * Re-exports the HTTP Basic, Digest, and Token authentication helpers
 * from ActionDispatch.
 * @see https://api.rubyonrails.org/classes/ActionController/HttpAuthentication.html
 */

export {
  BasicAuth,
  TokenAuth,
  DigestAuth,
  type BasicAuthCredentials,
  type TokenAuthCredentials,
  type DigestAuthParams,
} from "../../actiondispatch/http-authentication.js";
