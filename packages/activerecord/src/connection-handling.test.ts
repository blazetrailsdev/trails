import { describe, it } from "vitest";

describe("ConnectionHandlingTest", () => {
  it.skip("#with_connection lease the connection for the duration of the block", () => {});
  it.skip("#lease_connection makes the lease permanent even inside #with_connection", () => {});
  it.skip("#lease_connection makes the lease permanent even inside #with_connection(prevent_permanent_checkout: true)", () => {});
  it.skip("#with_connection use the already leased connection if available", () => {});
  it.skip("#with_connection is reentrant", () => {});
  it.skip("#connection is a soft-deprecated alias to #lease_connection", () => {});
  it.skip("#connection emits a deprecation warning if ActiveRecord.permanent_connection_checkout == :deprecated", () => {});
  it.skip("#connection raises an error if ActiveRecord.permanent_connection_checkout == :disallowed", () => {});
  it.skip("#connection doesn't make the lease permanent if inside #with_connection(prevent_permanent_checkout: true)", () => {});
  it.skip("common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed", () => {});
});
