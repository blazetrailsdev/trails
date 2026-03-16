import { describe, it } from "vitest";

describe("ConnectionHandlersShardingDbTest", () => {
  it.skip("establishing a connection in connected to block uses current role and shard", () => {});
  it.skip("establish connection using 3 levels config", () => {});
  it.skip("establish connection using 3 levels config with shards and replica", () => {});
  it.skip("switching connections via handler", () => {});
  it.skip("retrieves proper connection with nested connected to", () => {});
  it.skip("connected to raises without a shard or role", () => {});
  it.skip("connects to raises with a shard and database key", () => {});
  it.skip("retrieve connection pool with invalid shard", () => {});
  it.skip("calling connected to on a non existent shard raises", () => {});
  it.skip("calling connected to on a non existent role for shard raises", () => {});
  it.skip("calling connected to on a default role for non existent shard raises", () => {});
  it.skip("cannot swap shards while prohibited", () => {});
  it.skip("can swap roles while shard swapping is prohibited", () => {});
  it.skip("default shard is chosen by first key or default", () => {});
  it.skip("same shards across clusters", () => {});
  it.skip("sharding separation", () => {});
  it.skip("swapping shards globally in a multi threaded environment", () => {});
  it.skip("swapping shards and roles in a multi threaded environment", () => {});
  it.skip("swapping granular shards and roles in a multi threaded environment", () => {});
});
