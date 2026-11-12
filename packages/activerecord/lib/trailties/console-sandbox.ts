import { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

AbstractAdapter.setCallback("checkout", "after", async function (this: AbstractAdapter) {
  await this.beginTransaction({ joinable: false });
});
