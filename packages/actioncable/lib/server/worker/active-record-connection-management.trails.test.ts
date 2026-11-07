import { afterEach, describe, expect, it } from "vitest";
import { Callbacks, include, TopLevel, type Included } from "@blazetrails/activesupport";
import { ActiveRecordConnectionManagement } from "./active-record-connection-management.js";

const saved = TopLevel.ActiveRecord;

afterEach(() => {
  TopLevel.ActiveRecord = saved;
});

function buildHost() {
  class Host {
    declare static defineCallbacks: (name: string) => void;
    declare runCallbacks: Included<typeof Callbacks>["runCallbacks"];
    connection: unknown = null;
  }
  include(Host, Callbacks);
  Host.defineCallbacks("work");
  include(Host, ActiveRecordConnectionManagement);
  return Host;
}

function connection(tagged: unknown[]) {
  return {
    logger: {
      tag<T>(logger: unknown, block: () => T): T {
        tagged.push(logger);
        return block();
      },
    },
  };
}

describe("ActionCable::Server::Worker::ActiveRecordConnectionManagement", () => {
  it("wraps work in with_database_connections when ActiveRecord::Base is defined", async () => {
    const arLogger = { name: "ar" };
    TopLevel.ActiveRecord = { Base: { logger: arLogger } } as never;
    const host = new (buildHost())();
    const tagged: unknown[] = [];
    host.connection = connection(tagged);
    let ran = false;
    await host.runCallbacks("work", () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(tagged).toEqual([arLogger]);
  });

  it("adds no callback when ActiveRecord::Base is not defined", async () => {
    TopLevel.ActiveRecord = undefined;
    const host = new (buildHost())();
    const tagged: unknown[] = [];
    host.connection = connection(tagged);
    await host.runCallbacks("work", () => {});
    expect(tagged).toEqual([]);
  });
});
