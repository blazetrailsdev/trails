import * as Rack from "@blazetrails/rack-cors";
import { block } from "@blazetrails/ruby-compat";
import { Trails } from "../../../../../lib/trails.js";

Trails.application!.config.middleware.insertBefore(
  0,
  Rack.Cors,
  block(function (this: Rack.Cors) {
    this.allow(function (this: Rack.Resources) {
      this.origins("example.com");

      this.resource("*", {
        headers: "any",
        methods: ["get", "post", "put", "patch", "delete", "options", "head"],
      });
    });
  }),
);
