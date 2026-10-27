import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./bad-request.js";
import * as m1 from "./body-proxy.js";
import * as m2 from "./builder.js";
import * as m3 from "./conditional-get.js";
import * as m4 from "./content-length.js";
import * as m5 from "./etag.js";
import * as m6 from "./files.js";
import * as m7 from "./head.js";
import * as m8 from "./headers.js";
import * as m9 from "./lint.js";
import * as m10 from "./lock.js";
import * as m11 from "./media-type.js";
import * as m12 from "./method-override.js";
import * as m13 from "./mock-request.js";
import * as m14 from "./mock-response.js";
import * as m15 from "./multipart.js";
import * as m16 from "./multipart/generator.js";
import * as m17 from "./multipart/parser.js";
import * as m18 from "./multipart/uploaded-file.js";
import * as m19 from "./query-parser.js";
import * as m20 from "./request.js";
import * as m21 from "./response.js";
import * as m22 from "./runtime.js";
import * as m23 from "./sendfile.js";
import * as m24 from "./tempfile-reaper.js";
import * as m25 from "./urlmap.js";
import * as m26 from "./utils.js";

registerClassPaths([
  [() => m0.BadRequest, "Rack::BadRequest"],
  [() => m1.BodyProxy, "Rack::BodyProxy"],
  [() => m2.Builder, "Rack::Builder"],
  [() => m3.ConditionalGet, "Rack::ConditionalGet"],
  [() => m4.ContentLength, "Rack::ContentLength"],
  [() => m5.ETag, "Rack::ETag"],
  [() => m6.Files, "Rack::Files"],
  [() => m6.BaseIterator, "Rack::Files::BaseIterator"],
  [() => m6.Iterator, "Rack::Files::Iterator"],
  [() => m7.Head, "Rack::Head"],
  [() => m8.Headers, "Rack::Headers"],
  [() => m9.Lint, "Rack::Lint"],
  [() => m9.LintError, "Rack::Lint::LintError"],
  [() => m9.Wrapper, "Rack::Lint::Wrapper"],
  [() => m9.ErrorWrapper, "Rack::Lint::Wrapper::ErrorWrapper"],
  [() => m9.InputWrapper, "Rack::Lint::Wrapper::InputWrapper"],
  [() => m9.StreamWrapper, "Rack::Lint::Wrapper::StreamWrapper"],
  [() => m10.Lock, "Rack::Lock"],
  [() => m11.MediaType, "Rack::MediaType"],
  [() => m12.MethodOverride, "Rack::MethodOverride"],
  [() => m13.MockRequest, "Rack::MockRequest"],
  [() => m13.FatalWarner, "Rack::MockRequest::FatalWarner"],
  [() => m13.FatalWarning, "Rack::MockRequest::FatalWarning"],
  [() => m14.MockResponse, "Rack::MockResponse"],
  [() => m15.Multipart, "Rack::Multipart"],
  [() => m17.BoundaryTooLongError, "Rack::Multipart::BoundaryTooLongError"],
  [() => m17.EmptyContentError, "Rack::Multipart::EmptyContentError"],
  [() => m16.Generator, "Rack::Multipart::Generator"],
  [() => m15.MissingInputError, "Rack::Multipart::MissingInputError"],
  [() => m17.MultipartPartLimitError, "Rack::Multipart::MultipartPartLimitError"],
  [() => m17.MultipartTotalPartLimitError, "Rack::Multipart::MultipartTotalPartLimitError"],
  [() => m15.ParamList, "Rack::Multipart::ParamList"],
  [() => m17.Parser, "Rack::Multipart::Parser"],
  [() => m17.BoundedIO, "Rack::Multipart::Parser::BoundedIO"],
  [() => m17.Collector, "Rack::Multipart::Parser::Collector"],
  [() => m17.BufferPart, "Rack::Multipart::Parser::Collector::BufferPart"],
  [() => m17.MimePart, "Rack::Multipart::Parser::Collector::MimePart"],
  [() => m17.TempfilePart, "Rack::Multipart::Parser::Collector::TempfilePart"],
  [() => m17.MultipartInfo, "Rack::Multipart::Parser::MultipartInfo"],
  [() => m18.UploadedFile, "Rack::Multipart::UploadedFile"],
  [() => m19.QueryParser, "Rack::QueryParser"],
  [() => m19.InvalidParameterError, "Rack::QueryParser::InvalidParameterError"],
  [() => m19.ParameterTypeError, "Rack::QueryParser::ParameterTypeError"],
  [() => m19.Params, "Rack::QueryParser::Params"],
  [() => m19.QueryLimitError, "Rack::QueryParser::QueryLimitError"],
  [() => m20.Request, "Rack::Request"],
  [() => m20.Env, "Rack::Request::Env"],
  [() => m20.Helpers, "Rack::Request::Helpers"],
  [() => m21.Response, "Rack::Response"],
  [() => m21.Helpers, "Rack::Response::Helpers"],
  [() => m21.Raw, "Rack::Response::Raw"],
  [() => m22.Runtime, "Rack::Runtime"],
  [() => m23.Sendfile, "Rack::Sendfile"],
  [() => m24.TempfileReaper, "Rack::TempfileReaper"],
  [() => m25.URLMap, "Rack::URLMap"],
  [() => m26.Context, "Rack::Utils::Context"],
]);
