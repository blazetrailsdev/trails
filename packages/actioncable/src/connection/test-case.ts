import { Headers, TestRequest as ActionDispatchTestRequest } from "@blazetrails/actionpack";
import {
  assertRaises,
  camelize,
  classAttribute,
  Concern,
  constantize,
  ConstantLookup,
  extend,
  HashWithIndifferentAccess,
  include,
  isPlainObject,
  isPresent,
  Logger,
  runLoadHooks,
  StringIO,
  symbolizeKeys,
  TaggedLogging,
  toQuery,
  withIndifferentAccess,
} from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import {
  defineModule,
  Hash,
  rbClassInheritedP,
  rbObjRespondTo,
  rbObjSingletonClass,
  RuntimeError,
  StandardError,
  toS,
  URI,
} from "@blazetrails/ruby-compat";
import { ActionCable, Connection } from "../namespaces.js";
import { Authorization } from "./authorization.js";
import { Base } from "./base.js";
import { TaggedLoggerProxy } from "./tagged-logger-proxy.js";

type Data = Record<string, unknown>;

export class NonInferrableConnectionError extends StandardError {
  constructor(name: unknown) {
    super(
      `Unable to determine the connection to test from ${toS(name)}. ` +
        "You'll need to specify it using `tests YourConnection` in your " +
        "test case definition.",
    );
  }
}

export const Assertions = defineModule({
  async assertRejectConnection(block: () => unknown): Promise<unknown> {
    return await assertRaises(
      [Authorization.UnauthorizedError],
      { message: "Expected to reject connection but no rejection was made" },
      block,
    );
  },
});

export class TestCookies extends HashWithIndifferentAccess {
  override set(name: string, options: unknown): this {
    const value =
      isPlainObject(options) || options instanceof Hash
        ? (symbolizeKeys(options as Data) as Data)["value"]
        : options;
    return super.set(name, value);
  }
}

export class TestCookieJar extends TestCookies {
  /** @internal */
  private _signed?: TestCookies;
  /** @internal */
  private _encrypted?: TestCookies;

  get signed(): TestCookies {
    return (this._signed ??= new TestCookies());
  }

  get encrypted(): TestCookies {
    return (this._encrypted ??= new TestCookies());
  }
}

export class TestRequest extends ActionDispatchTestRequest {
  /** @internal */
  private _session: unknown;
  /** @internal */
  private _cookieJar: unknown;

  override get session(): never {
    return this._session as never;
  }

  override set session(session: unknown) {
    this._session = session;
  }

  override cookieJar = (): never => this._cookieJar as never;

  override setCookieJar = (cookieJar: unknown): void => {
    this._cookieJar = cookieJar;
  };
}

interface TestConnectionHost {
  _logger: unknown;
  _request: TestRequest;
  env: unknown;
}

export const TestConnection = defineModule({
  get logger(): unknown {
    return (this as unknown as TestConnectionHost)._logger;
  },

  get request(): TestRequest {
    return (this as unknown as TestConnectionHost)._request;
  },
});

type ConnectionClass = typeof Base;
type TestedConnection = Base & {
  connect?(): unknown;
  disconnect?(): unknown;
};

interface BehaviorClass {
  name: string;
  _connectionClass: ConnectionClass | null | undefined;
  determineConstantFromTestName(testName: string, block: (constant: unknown) => unknown): unknown;
  tests(connection: unknown): ConnectionClass;
  connectionClass(): ConnectionClass;
  determineDefaultConnection(name: string): ConnectionClass;
}

export const ClassMethods: Omit<
  BehaviorClass,
  "name" | "_connectionClass" | "determineConstantFromTestName"
> &
  ThisType<BehaviorClass> = {
  tests(connection: unknown): ConnectionClass {
    if (typeof connection === "string") {
      return (this._connectionClass = constantize(camelize(toS(connection))) as ConnectionClass);
    } else if (typeof connection === "function") {
      return (this._connectionClass = connection as ConnectionClass);
    } else {
      throw new NonInferrableConnectionError(connection);
    }
  },

  connectionClass(): ConnectionClass {
    const connection = this._connectionClass;
    if (connection != null) {
      return connection;
    } else {
      return this.tests(this.determineDefaultConnection(this.name));
    }
  },

  determineDefaultConnection(name: string): ConnectionClass {
    const connection = this.determineConstantFromTestName(
      name,
      (constant) => typeof constant === "function" && rbClassInheritedP(constant, Base) === true,
    );
    if (connection == null) throw new NonInferrableConnectionError(name);
    return connection as ConnectionClass;
  },
};

interface RequestParams {
  params?: Data | null;
  headers?: Data;
  session?: Data;
  env?: Data;
}

export interface Behavior {
  readonly connection: TestedConnection | null;
  /** @internal */
  _connection: TestedConnection | null | undefined;
  _cookieJar?: TestCookieJar;
  assertRejectConnection(block: () => unknown): Promise<unknown>;
}

type Host = Behavior;

/** @missingRailsArgs include — PERMANENT */
async function connect(
  this: Host,
  path: string | null = (ActionCable.server() as { config: { mountPath: string | null } }).config
    .mountPath,
  requestParams: RequestParams = {},
): Promise<TestedConnection> {
  path ??= DEFAULT_PATH;

  const connection = Object.create(
    (this.constructor as unknown as BehaviorClass).connectionClass().prototype,
  ) as TestedConnection;
  include(rbObjSingletonClass(connection), TestConnection);
  const request = buildTestRequest.call(this, path, requestParams);
  const innerLogger = new Logger(new StringIO());
  const taggedLogging = TaggedLogging.new(innerLogger);
  const host = connection as unknown as TestConnectionHost;
  host._logger = new TaggedLoggerProxy(taggedLogging, { tags: [] });
  host._request = request;
  host.env = request.env;
  if (rbObjRespondTo(connection, "connect")) await connection.connect!();
  return (this._connection = connection);
}

async function disconnect(this: Host): Promise<void> {
  if (this.connection == null) throw new RuntimeError("Must be connected!");

  if (rbObjRespondTo(this.connection, "disconnect")) await this.connection.disconnect!();
  this._connection = null;
}

function cookies(this: Host): TestCookieJar {
  return (this._cookieJar ??= new TestCookieJar());
}

/** @internal */
function buildTestRequest(
  this: Host,
  path: string,
  { params = null, headers = {}, session = {}, env = {} }: RequestParams = {},
): TestRequest {
  const wrappedHeaders = Headers.fromHash(headers);
  const uri = URI.parse(path) as { query: string | null; path: string };

  const queryString = params == null ? uri.query : toQuery(params);

  const requestEnv: Data = {
    QUERY_STRING: queryString,
    PATH_INFO: uri.path,
    ...env,
  };

  if (isPresent(wrappedHeaders)) {
    Headers.fromHash(requestEnv).mergeBang(wrappedHeaders);
  }

  const request = TestRequest.create(requestEnv as never) as TestRequest;
  request.session = withIndifferentAccess(session);
  request.setCookieJar(cookies.call(this) as never);
  return request;
}

export const DEFAULT_PATH = "/cable";

export const Behavior = {
  ClassMethods,
  DEFAULT_PATH,
  get connection(): TestedConnection | null {
    return (this as unknown as Behavior)._connection ?? null;
  },
} as Record<string, unknown> & {
  ClassMethods: typeof ClassMethods;
};
extend(Behavior, Concern);
include(Behavior, ConstantLookup);
include(Behavior, Assertions);

Object.assign(Behavior, { connect, disconnect, cookies, buildTestRequest });

(
  Behavior as unknown as { included(base: null, block: (this: typeof TestCase) => void): void }
).included(null, function (this: typeof TestCase) {
  classAttribute.call(this, "_connectionClass");
  runLoadHooks("action_cable_connection_test_case", this);
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TestCase extends Behavior {
  connect: typeof connect;
  disconnect: typeof disconnect;
  cookies: typeof cookies;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestCase extends ActiveSupportTestCase {}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace TestCase {
  /** @internal */
  let _connectionClass: ConnectionClass | null | undefined;
  const tests: (typeof ClassMethods)["tests"];
  const connectionClass: (typeof ClassMethods)["connectionClass"];
  const determineDefaultConnection: (typeof ClassMethods)["determineDefaultConnection"];
}

include(TestCase, Behavior);

Connection.TestCase = TestCase;
Connection.NonInferrableConnectionError = NonInferrableConnectionError;
Connection.Assertions = Assertions;
Connection.TestCookies = TestCookies;
Connection.TestCookieJar = TestCookieJar;
Connection.TestRequest = TestRequest;
Connection.TestConnection = TestConnection;
