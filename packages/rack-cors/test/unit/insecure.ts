import type { Builder } from "@blazetrails/rack";
import { block } from "@blazetrails/ruby-compat";

import { Cors } from "../../lib/index.js";

export default function (builder: Builder): void {
  builder.use(
    Cors,
    block(function (this: Cors) {
      this.allow(function () {
        this.origins("*");
        this.resource("/public", { credentials: true });
      });
    }),
  );
}
