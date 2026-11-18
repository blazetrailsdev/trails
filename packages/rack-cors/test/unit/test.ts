import { Lint, type Builder, type RackEnv } from "@blazetrails/rack";
import { block } from "@blazetrails/ruby-compat";

import { Cors } from "../../lib/index.js";

export default function (builder: Builder): void {
  builder.use(Lint);
  builder.use(
    Cors,
    block(function (this: Cors) {
      this.allow(function () {
        this.origins(
          "localhost:3000",
          "127.0.0.1:3000",
          /http:\/\/192\.168\.0\.\d{1,3}(:\d+)?/,
          "file://",
          /http:\/\/(.*?)\.example\.com/,
          "custom-protocol://abcdefg",
        );

        this.resource("/get-only", { methods: "get" });
        this.resource("/", { headers: ":any", methods: ":any" });
        this.resource("/options", { methods: "options" });
        this.resource("/single_header", { headers: "x-domain-token" });
        this.resource("/two_headers", { headers: ["x-domain-token", "x-requested-with"] });
        this.resource("/expose_single_header", { expose: "expose-test" });
        this.resource("/expose_multiple_headers", { expose: ["expose-test-1", "expose-test-2"] });
        this.resource("/conditional", {
          methods: "get",
          if: (env: RackEnv) => env["HTTP_X_OK"] != null && env["HTTP_X_OK"] !== false,
        });
        this.resource("/vary_test", { methods: "get", vary: ["Origin", "Host"] });
        this.resource("/patch_test", { methods: "patch" });
        this.resource("/$batch", { methods: "post" });
        this.resource("/wildcard/*", { methods: ":any" });
      });

      this.allow(function () {
        this.origins(
          block((source: string | null, _env: RackEnv) => source!.endsWith("10.10.10.10:3000")),
        );
        this.resource("/proc-origin");
      });

      this.allow(function () {
        this.origins((source: string | null, _env: RackEnv) =>
          source!.endsWith("10.10.10.10:3000"),
        );
        this.resource("/lambda-origin");
      });

      this.allow(function () {
        this.origins("*");
        this.resource("/public");
        this.resource("/public/*");
        this.resource("/public_without_credentials", { credentials: false });
      });

      this.allow(function () {
        this.origins("mucho-grande.com");
        this.resource("/multi-allow-config", { maxAge: 600 });
      });

      this.allow(function () {
        this.origins("*");
        this.resource("/multi-allow-config", { maxAge: 300, credentials: false });
      });

      this.allow(function () {
        this.origins("");
        this.resource("/blank-origin");
      });
    }),
  );
}
