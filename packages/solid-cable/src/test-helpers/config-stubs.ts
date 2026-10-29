import { ActiveRecord } from "@blazetrails/activerecord";
import {
  EnvironmentInquirer,
  Executor,
  OrderedOptions,
  TopLevel,
} from "@blazetrails/activesupport";
import { afterAll, beforeAll } from "vitest";

export class ConfigStub {
  private _config: OrderedOptions;
  private _executor?: ExectorStub;

  constructor(options: Record<string, unknown> = {}) {
    this._config = new OrderedOptions();
    this._config.update({ adapter: "test", ...options });
  }

  async configFor(_file: string): Promise<OrderedOptions> {
    return this._config;
  }

  get executor(): ExectorStub {
    return (this._executor ??= new ExectorStub());
  }
}

export class ExectorStub {
  runBang(): void {}

  wrap<T>(block: () => T): T {
    return Executor.wrap(block);
  }
}

type Trails = NonNullable<typeof TopLevel.Trails>;

function stubTrails(options: Record<string, unknown> = {}): Trails {
  const old = TopLevel.Trails;
  return {
    ...old,
    env: old?.env ?? new EnvironmentInquirer(ActiveRecord.ConnectionHandling.DEFAULT_ENV()),
    application: new ConfigStub(options),
  } as unknown as Trails;
}

export async function withCableConfig<T>(
  options: Record<string, unknown>,
  block: () => Promise<T>,
): Promise<T> {
  const old = TopLevel.Trails;
  TopLevel.Trails = stubTrails(options);
  try {
    return await block();
  } finally {
    TopLevel.Trails = old;
  }
}

export function useDummyApplication(): void {
  let old: typeof TopLevel.Trails;
  beforeAll(() => {
    old = TopLevel.Trails;
    TopLevel.Trails = stubTrails();
  });
  afterAll(() => {
    TopLevel.Trails = old;
  });
}
