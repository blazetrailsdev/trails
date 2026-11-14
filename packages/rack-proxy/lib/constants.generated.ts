import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./http-streaming-response.js";
import * as m1 from "./proxy.js";

defineConstants([
  [() => m0.HttpStreamingResponse, "Rack::HttpStreamingResponse"],
  [() => m1.Proxy, "Rack::Proxy"],
  [() => m0.ResponseTooLarge, "Rack::ResponseTooLarge"],
  [() => m0.StreamAborted, "Rack::StreamAborted"],
]);
