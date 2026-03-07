// Request env keys
export const HTTP_HOST = "HTTP_HOST";
export const HTTP_PORT = "HTTP_PORT";
export const HTTPS = "HTTPS";
export const PATH_INFO = "PATH_INFO";
export const REQUEST_METHOD = "REQUEST_METHOD";
export const REQUEST_PATH = "REQUEST_PATH";
export const SCRIPT_NAME = "SCRIPT_NAME";
export const QUERY_STRING = "QUERY_STRING";
export const SERVER_PROTOCOL = "SERVER_PROTOCOL";
export const SERVER_NAME = "SERVER_NAME";
export const SERVER_PORT = "SERVER_PORT";
export const HTTP_COOKIE = "HTTP_COOKIE";

// Response Header Keys
export const CACHE_CONTROL = "cache-control";
export const CONTENT_LENGTH = "content-length";
export const CONTENT_TYPE = "content-type";
export const ETAG = "etag";
export const EXPIRES = "expires";
export const SET_COOKIE = "set-cookie";
export const TRANSFER_ENCODING = "transfer-encoding";

// HTTP method verbs
export const GET = "GET";
export const POST = "POST";
export const PUT = "PUT";
export const PATCH = "PATCH";
export const DELETE = "DELETE";
export const HEAD = "HEAD";
export const OPTIONS = "OPTIONS";
export const CONNECT = "CONNECT";
export const LINK = "LINK";
export const UNLINK = "UNLINK";
export const TRACE = "TRACE";

// Rack environment variables
export const RACK_VERSION = "rack.version";
export const RACK_TEMPFILES = "rack.tempfiles";
export const RACK_EARLY_HINTS = "rack.early_hints";
export const RACK_ERRORS = "rack.errors";
export const RACK_LOGGER = "rack.logger";
export const RACK_INPUT = "rack.input";
export const RACK_SESSION = "rack.session";
export const RACK_SESSION_OPTIONS = "rack.session.options";
export const RACK_SHOWSTATUS_DETAIL = "rack.showstatus.detail";
export const RACK_URL_SCHEME = "rack.url_scheme";
export const RACK_HIJACK = "rack.hijack";
export const RACK_IS_HIJACK = "rack.hijack?";
export const RACK_RECURSIVE_INCLUDE = "rack.recursive.include";
export const RACK_MULTIPART_BUFFER_SIZE = "rack.multipart.buffer_size";
export const RACK_MULTIPART_TEMPFILE_FACTORY = "rack.multipart.tempfile_factory";
export const RACK_RESPONSE_FINISHED = "rack.response_finished";
export const RACK_PROTOCOL = "rack.protocol";
export const RACK_REQUEST_FORM_INPUT = "rack.request.form_input";
export const RACK_REQUEST_FORM_HASH = "rack.request.form_hash";
export const RACK_REQUEST_FORM_PAIRS = "rack.request.form_pairs";
export const RACK_REQUEST_FORM_VARS = "rack.request.form_vars";
export const RACK_REQUEST_FORM_ERROR = "rack.request.form_error";
export const RACK_REQUEST_COOKIE_HASH = "rack.request.cookie_hash";
export const RACK_REQUEST_COOKIE_STRING = "rack.request.cookie_string";
export const RACK_REQUEST_QUERY_HASH = "rack.request.query_hash";
export const RACK_REQUEST_QUERY_STRING = "rack.request.query_string";
export const RACK_REQUEST_TRUSTED_PROXY = "rack.request.trusted_proxy";
export const RACK_METHODOVERRIDE_ORIGINAL_METHOD = "rack.methodoverride.original_method";

// Status codes with no entity body
export const STATUS_WITH_NO_ENTITY_BODY: Record<number, boolean> = Object.fromEntries(
  [...Array.from({ length: 100 }, (_, i) => [100 + i, true]), [204, true], [304, true]]
);
