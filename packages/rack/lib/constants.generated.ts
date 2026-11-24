import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./bad-request.js";
import * as m1 from "./body-proxy.js";
import * as m2 from "./builder.js";
import * as m3 from "./common-logger.js";
import * as m4 from "./conditional-get.js";
import * as m5 from "./config.js";
import * as m6 from "./content-length.js";
import * as m7 from "./etag.js";
import * as m8 from "./files.js";
import * as m9 from "./head.js";
import * as m10 from "./headers.js";
import * as m11 from "./lint.js";
import * as m12 from "./lock.js";
import * as m13 from "./media-type.js";
import * as m14 from "./method-override.js";
import * as m15 from "./mime.js";
import * as m16 from "./mock-request.js";
import * as m17 from "./mock-response.js";
import * as m18 from "./multipart.js";
import * as m19 from "./multipart/generator.js";
import * as m20 from "./multipart/parser.js";
import * as m21 from "./multipart/uploaded-file.js";
import * as m22 from "./query-parser.js";
import * as m23 from "./request.js";
import * as m24 from "./response.js";
import * as m25 from "./runtime.js";
import * as m26 from "./sendfile.js";
import * as m27 from "./show-exceptions.js";
import * as m28 from "./tempfile-reaper.js";
import * as m29 from "./urlmap.js";
import * as m30 from "./utils.js";

defineConstants([
  [() => m0, "BadRequest", "Rack::BadRequest"],
  [() => m1, "BodyProxy", "Rack::BodyProxy"],
  [() => m2, "Builder", "Rack::Builder"],
  [() => m3, "CommonLogger", "Rack::CommonLogger"],
  [() => m4, "ConditionalGet", "Rack::ConditionalGet"],
  [() => m5, "Config", "Rack::Config"],
  [() => m6, "ContentLength", "Rack::ContentLength"],
  [() => m7, "ETag", "Rack::ETag"],
  [() => m8, "Files", "Rack::Files"],
  [() => m8, "BaseIterator", "Rack::Files::BaseIterator"],
  [() => m8, "Iterator", "Rack::Files::Iterator"],
  [() => m9, "Head", "Rack::Head"],
  [() => m10, "Headers", "Rack::Headers"],
  [() => m11, "Lint", "Rack::Lint"],
  [() => m11, "LintError", "Rack::Lint::LintError"],
  [() => m11, "Wrapper", "Rack::Lint::Wrapper"],
  [() => m11, "ErrorWrapper", "Rack::Lint::Wrapper::ErrorWrapper"],
  [() => m11, "InputWrapper", "Rack::Lint::Wrapper::InputWrapper"],
  [() => m11, "StreamWrapper", "Rack::Lint::Wrapper::StreamWrapper"],
  [() => m12, "Lock", "Rack::Lock"],
  [() => m13, "MediaType", "Rack::MediaType"],
  [() => m14, "MethodOverride", "Rack::MethodOverride"],
  [() => m15, "Mime", "Rack::Mime"],
  [() => m16, "MockRequest", "Rack::MockRequest"],
  [() => m16, "FatalWarner", "Rack::MockRequest::FatalWarner"],
  [() => m16, "FatalWarning", "Rack::MockRequest::FatalWarning"],
  [() => m17, "MockResponse", "Rack::MockResponse"],
  [() => m17, "Cookie", "Rack::MockResponse::Cookie"],
  [() => m18, "Multipart", "Rack::Multipart"],
  [() => m20, "BoundaryTooLongError", "Rack::Multipart::BoundaryTooLongError"],
  [() => m20, "EmptyContentError", "Rack::Multipart::EmptyContentError"],
  [() => m19, "Generator", "Rack::Multipart::Generator"],
  [() => m18, "MissingInputError", "Rack::Multipart::MissingInputError"],
  [() => m20, "MultipartPartLimitError", "Rack::Multipart::MultipartPartLimitError"],
  [() => m20, "MultipartTotalPartLimitError", "Rack::Multipart::MultipartTotalPartLimitError"],
  [() => m18, "ParamList", "Rack::Multipart::ParamList"],
  [() => m20, "Parser", "Rack::Multipart::Parser"],
  [() => m20, "BoundedIO", "Rack::Multipart::Parser::BoundedIO"],
  [() => m20, "Collector", "Rack::Multipart::Parser::Collector"],
  [() => m20, "BufferPart", "Rack::Multipart::Parser::Collector::BufferPart"],
  [() => m20, "MimePart", "Rack::Multipart::Parser::Collector::MimePart"],
  [() => m20, "TempfilePart", "Rack::Multipart::Parser::Collector::TempfilePart"],
  [() => m20, "MultipartInfo", "Rack::Multipart::Parser::MultipartInfo"],
  [() => m21, "UploadedFile", "Rack::Multipart::UploadedFile"],
  [() => m22, "QueryParser", "Rack::QueryParser"],
  [() => m22, "InvalidParameterError", "Rack::QueryParser::InvalidParameterError"],
  [() => m22, "ParameterTypeError", "Rack::QueryParser::ParameterTypeError"],
  [() => m22, "Params", "Rack::QueryParser::Params"],
  [() => m22, "QueryLimitError", "Rack::QueryParser::QueryLimitError"],
  [() => m23, "Request", "Rack::Request"],
  [() => m23, "Env", "Rack::Request::Env"],
  [() => m23, "Helpers", "Rack::Request::Helpers"],
  [() => m24, "Response", "Rack::Response"],
  [() => m24, "Helpers", "Rack::Response::Helpers"],
  [() => m24, "Raw", "Rack::Response::Raw"],
  [() => m25, "Runtime", "Rack::Runtime"],
  [() => m26, "Sendfile", "Rack::Sendfile"],
  [() => m27, "ShowExceptions", "Rack::ShowExceptions"],
  [() => m27, "Frame", "Rack::ShowExceptions::Frame"],
  [() => m28, "TempfileReaper", "Rack::TempfileReaper"],
  [() => m29, "URLMap", "Rack::URLMap"],
  [() => m30, "Context", "Rack::Utils::Context"],
]);
