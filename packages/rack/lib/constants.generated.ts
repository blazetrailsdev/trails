import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./bad-request.js";
import * as m1 from "./body-proxy.js";
import * as m2 from "./builder.js";
import * as m3 from "./common-logger.js";
import * as m4 from "./conditional-get.js";
import * as m5 from "./content-length.js";
import * as m6 from "./etag.js";
import * as m7 from "./files.js";
import * as m8 from "./head.js";
import * as m9 from "./headers.js";
import * as m10 from "./lint.js";
import * as m11 from "./lock.js";
import * as m12 from "./media-type.js";
import * as m13 from "./method-override.js";
import * as m14 from "./mime.js";
import * as m15 from "./mock-request.js";
import * as m16 from "./mock-response.js";
import * as m17 from "./multipart.js";
import * as m18 from "./multipart/generator.js";
import * as m19 from "./multipart/parser.js";
import * as m20 from "./multipart/uploaded-file.js";
import * as m21 from "./query-parser.js";
import * as m22 from "./request.js";
import * as m23 from "./response.js";
import * as m24 from "./runtime.js";
import * as m25 from "./sendfile.js";
import * as m26 from "./show-exceptions.js";
import * as m27 from "./tempfile-reaper.js";
import * as m28 from "./urlmap.js";
import * as m29 from "./utils.js";

defineConstants([
  [() => m0.BadRequest, "Rack::BadRequest"],
  [() => m1.BodyProxy, "Rack::BodyProxy"],
  [() => m2.Builder, "Rack::Builder"],
  [() => m3.CommonLogger, "Rack::CommonLogger"],
  [() => m4.ConditionalGet, "Rack::ConditionalGet"],
  [() => m5.ContentLength, "Rack::ContentLength"],
  [() => m6.ETag, "Rack::ETag"],
  [() => m7.Files, "Rack::Files"],
  [() => m7.BaseIterator, "Rack::Files::BaseIterator"],
  [() => m7.Iterator, "Rack::Files::Iterator"],
  [() => m8.Head, "Rack::Head"],
  [() => m9.Headers, "Rack::Headers"],
  [() => m10.Lint, "Rack::Lint"],
  [() => m10.LintError, "Rack::Lint::LintError"],
  [() => m10.Wrapper, "Rack::Lint::Wrapper"],
  [() => m10.ErrorWrapper, "Rack::Lint::Wrapper::ErrorWrapper"],
  [() => m10.InputWrapper, "Rack::Lint::Wrapper::InputWrapper"],
  [() => m10.StreamWrapper, "Rack::Lint::Wrapper::StreamWrapper"],
  [() => m11.Lock, "Rack::Lock"],
  [() => m12.MediaType, "Rack::MediaType"],
  [() => m13.MethodOverride, "Rack::MethodOverride"],
  [() => m14.Mime, "Rack::Mime"],
  [() => m15.MockRequest, "Rack::MockRequest"],
  [() => m15.FatalWarner, "Rack::MockRequest::FatalWarner"],
  [() => m15.FatalWarning, "Rack::MockRequest::FatalWarning"],
  [() => m16.MockResponse, "Rack::MockResponse"],
  [() => m16.Cookie, "Rack::MockResponse::Cookie"],
  [() => m17.Multipart, "Rack::Multipart"],
  [() => m19.BoundaryTooLongError, "Rack::Multipart::BoundaryTooLongError"],
  [() => m19.EmptyContentError, "Rack::Multipart::EmptyContentError"],
  [() => m18.Generator, "Rack::Multipart::Generator"],
  [() => m17.MissingInputError, "Rack::Multipart::MissingInputError"],
  [() => m19.MultipartPartLimitError, "Rack::Multipart::MultipartPartLimitError"],
  [() => m19.MultipartTotalPartLimitError, "Rack::Multipart::MultipartTotalPartLimitError"],
  [() => m17.ParamList, "Rack::Multipart::ParamList"],
  [() => m19.Parser, "Rack::Multipart::Parser"],
  [() => m19.BoundedIO, "Rack::Multipart::Parser::BoundedIO"],
  [() => m19.Collector, "Rack::Multipart::Parser::Collector"],
  [() => m19.BufferPart, "Rack::Multipart::Parser::Collector::BufferPart"],
  [() => m19.MimePart, "Rack::Multipart::Parser::Collector::MimePart"],
  [() => m19.TempfilePart, "Rack::Multipart::Parser::Collector::TempfilePart"],
  [() => m19.MultipartInfo, "Rack::Multipart::Parser::MultipartInfo"],
  [() => m20.UploadedFile, "Rack::Multipart::UploadedFile"],
  [() => m21.QueryParser, "Rack::QueryParser"],
  [() => m21.InvalidParameterError, "Rack::QueryParser::InvalidParameterError"],
  [() => m21.ParameterTypeError, "Rack::QueryParser::ParameterTypeError"],
  [() => m21.Params, "Rack::QueryParser::Params"],
  [() => m21.QueryLimitError, "Rack::QueryParser::QueryLimitError"],
  [() => m22.Request, "Rack::Request"],
  [() => m22.Env, "Rack::Request::Env"],
  [() => m22.Helpers, "Rack::Request::Helpers"],
  [() => m23.Response, "Rack::Response"],
  [() => m23.Helpers, "Rack::Response::Helpers"],
  [() => m23.Raw, "Rack::Response::Raw"],
  [() => m24.Runtime, "Rack::Runtime"],
  [() => m25.Sendfile, "Rack::Sendfile"],
  [() => m26.ShowExceptions, "Rack::ShowExceptions"],
  [() => m26.Frame, "Rack::ShowExceptions::Frame"],
  [() => m27.TempfileReaper, "Rack::TempfileReaper"],
  [() => m28.URLMap, "Rack::URLMap"],
  [() => m29.Context, "Rack::Utils::Context"],
]);
