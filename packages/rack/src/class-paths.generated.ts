import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./body-proxy.js";
import * as m1 from "./builder.js";
import * as m2 from "./conditional-get.js";
import * as m3 from "./content-length.js";
import * as m4 from "./etag.js";
import * as m5 from "./files.js";
import * as m6 from "./head.js";
import * as m7 from "./headers.js";
import * as m8 from "./lint.js";
import * as m9 from "./lock.js";
import * as m10 from "./media-type.js";
import * as m11 from "./method-override.js";
import * as m12 from "./mock-request.js";
import * as m13 from "./mock-response.js";
import * as m14 from "./multipart.js";
import * as m15 from "./multipart/generator.js";
import * as m16 from "./multipart/parser.js";
import * as m17 from "./multipart/uploaded-file.js";
import * as m18 from "./query-parser.js";
import * as m19 from "./request.js";
import * as m20 from "./response.js";
import * as m21 from "./runtime.js";
import * as m22 from "./sendfile.js";
import * as m23 from "./tempfile-reaper.js";
import * as m24 from "./urlmap.js";
import * as m25 from "./utils.js";

registerClassPaths([
  [() => m0.BodyProxy, "Rack::BodyProxy"],
  [() => m1.Builder, "Rack::Builder"],
  [() => m2.ConditionalGet, "Rack::ConditionalGet"],
  [() => m3.ContentLength, "Rack::ContentLength"],
  [() => m4.ETag, "Rack::ETag"],
  [() => m5.Files, "Rack::Files"],
  [() => m5.BaseIterator, "Rack::Files::BaseIterator"],
  [() => m5.Iterator, "Rack::Files::Iterator"],
  [() => m6.Head, "Rack::Head"],
  [() => m7.Headers, "Rack::Headers"],
  [() => m8.Lint, "Rack::Lint"],
  [() => m8.LintError, "Rack::Lint::LintError"],
  [() => m8.Wrapper, "Rack::Lint::Wrapper"],
  [() => m8.ErrorWrapper, "Rack::Lint::Wrapper::ErrorWrapper"],
  [() => m8.InputWrapper, "Rack::Lint::Wrapper::InputWrapper"],
  [() => m8.StreamWrapper, "Rack::Lint::Wrapper::StreamWrapper"],
  [() => m9.Lock, "Rack::Lock"],
  [() => m10.MediaType, "Rack::MediaType"],
  [() => m11.MethodOverride, "Rack::MethodOverride"],
  [() => m12.MockRequest, "Rack::MockRequest"],
  [() => m12.FatalWarner, "Rack::MockRequest::FatalWarner"],
  [() => m12.FatalWarning, "Rack::MockRequest::FatalWarning"],
  [() => m13.MockResponse, "Rack::MockResponse"],
  [() => m16.BoundaryTooLongError, "Rack::Multipart::BoundaryTooLongError"],
  [() => m16.EmptyContentError, "Rack::Multipart::EmptyContentError"],
  [() => m15.Generator, "Rack::Multipart::Generator"],
  [() => m14.MissingInputError, "Rack::Multipart::MissingInputError"],
  [() => m16.MultipartPartLimitError, "Rack::Multipart::MultipartPartLimitError"],
  [() => m16.MultipartTotalPartLimitError, "Rack::Multipart::MultipartTotalPartLimitError"],
  [() => m14.ParamList, "Rack::Multipart::ParamList"],
  [() => m16.Parser, "Rack::Multipart::Parser"],
  [() => m16.BoundedIO, "Rack::Multipart::Parser::BoundedIO"],
  [() => m16.Collector, "Rack::Multipart::Parser::Collector"],
  [() => m16.BufferPart, "Rack::Multipart::Parser::Collector::BufferPart"],
  [() => m16.MimePart, "Rack::Multipart::Parser::Collector::MimePart"],
  [() => m16.TempfilePart, "Rack::Multipart::Parser::Collector::TempfilePart"],
  [() => m16.MultipartInfo, "Rack::Multipart::Parser::MultipartInfo"],
  [() => m17.UploadedFile, "Rack::Multipart::UploadedFile"],
  [() => m18.QueryParser, "Rack::QueryParser"],
  [() => m18.InvalidParameterError, "Rack::QueryParser::InvalidParameterError"],
  [() => m18.ParameterTypeError, "Rack::QueryParser::ParameterTypeError"],
  [() => m18.Params, "Rack::QueryParser::Params"],
  [() => m18.QueryLimitError, "Rack::QueryParser::QueryLimitError"],
  [() => m19.Request, "Rack::Request"],
  [() => m20.Response, "Rack::Response"],
  [() => m20.Raw, "Rack::Response::Raw"],
  [() => m21.Runtime, "Rack::Runtime"],
  [() => m22.Sendfile, "Rack::Sendfile"],
  [() => m23.TempfileReaper, "Rack::TempfileReaper"],
  [() => m24.URLMap, "Rack::URLMap"],
  [() => m25.Context, "Rack::Utils::Context"],
]);
