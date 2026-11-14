import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./http-streaming-response.js";
import * as m1 from "./proxy.js";

defineConstants([
  [() => m0.HttpStreamingResponse, "Rack::HttpStreamingResponse"],
  [
    () => m0.HttpStreamingResponse.ResponseTooLarge,
    "Rack::HttpStreamingResponse::ResponseTooLarge",
  ],
  [() => m0.HttpStreamingResponse.StreamAborted, "Rack::HttpStreamingResponse::StreamAborted"],
  [() => m1.Proxy, "Rack::Proxy"],
]);
