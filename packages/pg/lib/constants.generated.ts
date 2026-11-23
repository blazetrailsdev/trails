import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./coder.js";
import * as m1 from "./composite-decoder.js";
import * as m2 from "./composite-encoder.js";
import * as m3 from "./connection.js";
import * as m4 from "./exceptions.js";
import * as m5 from "./result.js";
import * as m6 from "./simple-coder.js";
import * as m7 from "./simple-decoder.js";
import * as m8 from "./simple-encoder.js";
import * as m9 from "./text-decoder/array.js";
import * as m10 from "./text-decoder/boolean.js";
import * as m11 from "./text-decoder/bytea.js";
import * as m12 from "./text-decoder/date.js";
import * as m13 from "./text-decoder/float.js";
import * as m14 from "./text-decoder/integer.js";
import * as m15 from "./text-decoder/numeric.js";
import * as m16 from "./text-decoder/timestamp.js";
import * as m17 from "./text-encoder/array.js";
import * as m18 from "./text-encoder/boolean.js";
import * as m19 from "./text-encoder/integer.js";
import * as m20 from "./type-map-all-strings.js";
import * as m21 from "./type-map-by-class.js";
import * as m22 from "./type-map-by-oid.js";
import * as m23 from "./type-map.js";

defineConstants([
  [m0, "Coder", "PG::Coder"],
  [m0, "CompositeCoder", "PG::CompositeCoder"],
  [m1, "CompositeDecoder", "PG::CompositeDecoder"],
  [m2, "CompositeEncoder", "PG::CompositeEncoder"],
  [m3, "Connection", "PG::Connection"],
  [m4, "ConnectionBad", "PG::ConnectionBad"],
  [m4, "Error", "PG::Error"],
  [m4, "FeatureNotSupported", "PG::FeatureNotSupported"],
  [m5, "Result", "PG::Result"],
  [m4, "ServerError", "PG::ServerError"],
  [m6, "SimpleCoder", "PG::SimpleCoder"],
  [m7, "SimpleDecoder", "PG::SimpleDecoder"],
  [m8, "SimpleEncoder", "PG::SimpleEncoder"],
  [m9, "Array", "PG::TextDecoder::Array"],
  [m10, "Boolean", "PG::TextDecoder::Boolean"],
  [m11, "Bytea", "PG::TextDecoder::Bytea"],
  [m12, "Date", "PG::TextDecoder::Date"],
  [m13, "Float", "PG::TextDecoder::Float"],
  [m14, "Integer", "PG::TextDecoder::Integer"],
  [m15, "Numeric", "PG::TextDecoder::Numeric"],
  [m16, "Timestamp", "PG::TextDecoder::Timestamp"],
  [m16, "TimestampLocal", "PG::TextDecoder::TimestampLocal"],
  [m16, "TimestampUtc", "PG::TextDecoder::TimestampUtc"],
  [m16, "TimestampUtcToLocal", "PG::TextDecoder::TimestampUtcToLocal"],
  [m17, "Array", "PG::TextEncoder::Array"],
  [m18, "Boolean", "PG::TextEncoder::Boolean"],
  [m19, "Integer", "PG::TextEncoder::Integer"],
  [m23, "TypeMap", "PG::TypeMap"],
  [m23, "DefaultTypeMappable", "PG::TypeMap::DefaultTypeMappable"],
  [m20, "TypeMapAllStrings", "PG::TypeMapAllStrings"],
  [m21, "TypeMapByClass", "PG::TypeMapByClass"],
  [m22, "TypeMapByOid", "PG::TypeMapByOid"],
  [m4, "UnableToSend", "PG::UnableToSend"],
]);
