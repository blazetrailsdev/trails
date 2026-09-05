/**
 * `uri.rb` (`vendor/ruby/lib/uri.rb:91`), which requires the scheme files so
 * that `URI.parse` can answer their classes. Requiring `uri/https` pulls in
 * `uri/http` and `uri/generic` behind it, exactly as MRI's requires do
 * (`vendor/ruby/lib/uri/https.rb:10`, `vendor/ruby/lib/uri/http.rb:10`).
 */
export { URI, BadURIError, Error, InvalidComponentError, InvalidURIError } from "./uri/common.js";
export { DEFAULT_PARSER, RFC2396_PARSER, RFC3986_PARSER } from "./uri/common.js";
export { Generic } from "./uri/generic.js";
export { HTTP } from "./uri/http.js";
export { HTTPS } from "./uri/https.js";
