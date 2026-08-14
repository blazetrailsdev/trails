/**
 * Mirrors: active_support/testing/assertions.rb
 *
 * Rails accepts a String expression and `eval`s it against the block's binding
 * (assertions.rb:110-111, 186), and `assert_changes` also accepts a Symbol,
 * `to_s`-ed before that eval (assertions.rb:186). TypeScript has no binding to
 * eval against and no `eval` at all under the repo's rules, so the String and
 * Symbol arms are transcribed mechanically into the callable arm Rails
 * documents alongside them (`-> { Article.count }`):
 *
 *   assert_difference 'Article.count'      ->  assertDifference(() => Article.count())
 *   assert_difference 'Post.last.size', -1 ->  assertDifference(() => (await …).size, -1)
 *   assert_changes :@object, from: nil     ->  assertChanges(() => object, null, { from: null })
 *
 * The expression text survives the rewrite: `_callableToSourceString` quotes
 * the arrow's BODY, so an enrolled test's failure message reads
 * ``` `Article.count()` didn't change by 1 ``` — Rails' message with Rails'
 * expression in it. That also collapses Rails' `expression.respond_to?(:call)`
 * ternaries (assertions.rb:129, 199, 220): every expression here is a callable.
 *
 * Blocks may be async (trails' `count` is), so each assertion returns a Promise
 * and awaits both the expression and the block.
 */
import { indexWith } from "../enumerable-utils.js";

import { cwd, env, stdout } from "../process-adapter.js";
import { _testCaseIdentity, taggedLogger } from "./tagged-logging.js";

/**
 * Mirrors `Minitest::Assertion` — the error a failed assertion raises.
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails': Rails raises it
 * (assertions.rb, error_reporter_assertions.rb:45) but the class is defined in
 * the minitest gem, which has no vendored Rails file for the comparator to map
 * onto. Exported so `testing/error-reporter-assertions.ts` raises the same one.
 */
export class Assertion extends Error {
  override name = "Assertion";
}

/**
 * Mirrors `Minitest::Skip` (minitest.rb:1065-1069) — the assertion raised when
 * skipping a run, and the class {@link StatisticsReporter#report} counts the
 * skips of a run by.
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export class Skip extends Assertion {
  override name = "Skip";

  get resultLabel(): string {
    return "Skipped";
  }
}

/**
 * Mirrors `Minitest::UnexpectedError` (minitest.rb:1078-1110) — the wrapper
 * `assert_nothing_raised` re-raises an unexpected error in, and the class
 * {@link _assertNothingRaisedOrWarn} rescues to warn about it.
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails': Rails names the class
 * (assertions.rb:52, 283) but defines it in the minitest gem
 * (minitest.rb:1078-1110), which is a test-framework dependency with no
 * vendored Rails file for the comparator to map onto. Porting it here is what
 * lets `assert_nothing_raised` raise, and `_assert_nothing_raised_or_warn`
 * rescue, the class Rails names.
 *
 * `message` and `backtrace` are METHODS in minitest (minitest.rb:1097-1107),
 * reading the wrapped error when called. TypeScript cannot declare an accessor
 * over a base-class data property (`Error#message`/`#stack`, TS2611), so they
 * are installed on the prototype below — and the constructor deletes the own
 * properties `Error` installs, which would otherwise shadow them.
 */
export class UnexpectedError extends Assertion {
  override name = "UnexpectedError";
  error: Error;

  constructor(error: Error) {
    super("Unexpected exception");
    delete (this as { message?: string }).message;
    delete (this as { stack?: string }).stack;
    this.error = error;
  }

  get resultLabel(): string {
    return "Error";
  }
}

/**
 * Mirrors `Minitest::UnexpectedWarning` (minitest.rb:1113-1117) — the assertion
 * raised on a warning under `-Werror`.
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export class UnexpectedWarning extends Assertion {
  override name = "UnexpectedWarning";

  get resultLabel(): string {
    return "Warning";
  }
}

/**
 * Rails' `e.class` rendered as a name (minitest.rb:1105, assertions.rb:285).
 * trails carries the namespaced Rails name on `name` where it has been ported
 * (`ActionDispatch::ParamError`, param-error.ts:28), which `constructor.name`
 * truncates — so prefer it and fall back to the constructor, mirroring
 * ExceptionWrapper's `classNameOf` (exception-wrapper.ts:75).
 */
function classNameOf(e: Error): string {
  if (e.name && e.name !== "Error") return e.name;
  const ctor = e.constructor?.name;
  if (ctor && ctor !== "Error") return ctor;
  return e.name || ctor || "Error";
}

/**
 * Mirrors `Minitest::BacktraceFilter` (minitest.rb:1173-1199).
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails': Rails reassigns
 * `Minitest.backtrace_filter` but the class lives in the minitest gem, which
 * has no vendored Rails file for the comparator to map onto. Ported here for
 * the same reason {@link UnexpectedError} is.
 */
export class BacktraceFilter {
  /**
   * Mirrors `Minitest::BacktraceFilter::MT_RE` (minitest.rb:1176),
   * `%r%lib/minitest|internal:warning%`. The frames trails filters are
   * vitest's and node's, not minitest's, so the pattern names those instead —
   * the only part of this class that cannot be transcribed literally.
   *
   * @noRailsEquivalent PERMANENT — minitest's constant, not Rails'; see
   * {@link BacktraceFilter}.
   */
  static MT_RE = /node_modules[/\\]@?vitest|node:internal/;

  regexp: RegExp;

  constructor(regexp: RegExp = BacktraceFilter.MT_RE) {
    this.regexp = regexp;
  }

  /**
   * Mirrors `Minitest::BacktraceFilter#filter` (minitest.rb:1191-1201): the
   * whole trace under debug, else the frames before the first framework frame,
   * else every non-framework frame, else the whole trace.
   *
   * Ruby's `$DEBUG` half of the minitest.rb:1194 guard has no JS analogue —
   * there is no interpreter-wide debug global to read — so only the
   * `ENV["MT_DEBUG"]` half is ported, through `process-adapter`. Ruby
   * truthiness makes a set-but-empty `MT_DEBUG` count, hence the `!= null`
   * rather than a bare truthiness test.
   */
  filter(bt: string[] | null): string[] {
    if (!bt) return ["No backtrace"];

    if (env.MT_DEBUG != null) return [...bt];

    const framework = bt.findIndex((line) => this.regexp.test(line));
    let newBt = framework === -1 ? [...bt] : bt.slice(0, framework);
    if (newBt.length === 0) newBt = bt.filter((line) => !this.regexp.test(line));
    if (newBt.length === 0) newBt = [...bt];

    return newBt;
  }
}

/**
 * Mirrors the `Minitest` module's `backtrace_filter` accessor (minitest.rb:43,
 * assigned at :1204) and `Minitest.filter_backtrace` (minitest.rb:365-369).
 * Held on an object so the accessor is reassignable at the Ruby spelling
 * (`Minitest.backtraceFilter = ...`), which `filterBacktrace` reads on every
 * call the way the `cattr_accessor` does. The seat is typed by the `filter`
 * method alone because Ruby's is duck-typed: `rails_plugin.rb:118` assigns a
 * `BacktraceFilterWithFallback`, which is not a `BacktraceFilter`.
 *
 * @noRailsEquivalent PERMANENT — minitest's module surface; see
 * {@link BacktraceFilter}.
 */
export const Minitest: {
  backtraceFilter: { filter(bt: string[] | null): string[] };
  filterBacktrace(bt: string[] | null): string[];
  reporter: CompositeReporter | null;
  clockTime(): number;
} = {
  backtraceFilter: new BacktraceFilter(),

  filterBacktrace(bt: string[] | null): string[] {
    let result = Minitest.backtraceFilter.filter(bt);
    if (result.length === 0 && bt) result = [...bt];
    return result;
  },

  /**
   * Mirrors the `cattr_accessor :reporter` (minitest.rb:51), which
   * `Minitest.run` sets to the run's `CompositeReporter` around
   * `init_plugins` and nils out again (minitest.rb:290-296) — hence the
   * nullable seat rather than an eagerly-built composite.
   */
  reporter: null,

  /**
   * Mirrors `Minitest.clock_time` (minitest.rb:1229-1238): the monotonic clock
   * where one exists, `Time.now` otherwise. `performance.now()` is JS'
   * monotonic clock and reads in milliseconds, so it is divided to the seconds
   * both Ruby arms return.
   */
  clockTime(): number {
    if (typeof performance !== "undefined") return performance.now() / 1000;
    return Date.now() / 1000;
  },
};

/** Mirrors `Minitest::UnexpectedError::BASE_RE` (minitest.rb:1101). */
function baseRe(): RegExp {
  let pwd: string;
  try {
    pwd = cwd();
  } catch {
    return /(?!)/g;
  }
  return new RegExp(`${pwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "g");
}

Object.defineProperties(UnexpectedError.prototype, {
  stack: {
    configurable: true,
    get(this: UnexpectedError): string | undefined {
      return this.error.stack;
    },
  },
  message: {
    configurable: true,
    get(this: UnexpectedError): string {
      const bt = Minitest.filterBacktrace(backtrace(this.error))
        .join("\n    ")
        .replace(baseRe(), "");
      return `${classNameOf(this.error)}: ${this.error.message}\n    ${bt}`;
    },
  },
});

/**
 * Ruby's `Exception#backtrace` is the frame list alone, unindented; a JS
 * `stack` prepends a `"Name: message"` header line and indents each frame,
 * both of which are dropped here so the two carry the same thing.
 */
function backtrace(error: Error): string[] | null {
  if (error.stack == null) return null;
  return error.stack
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .map((line) => line.trim());
}

/** :nodoc: */
export const UNTRACKED: unique symbol = Symbol("UNTRACKED");

type Expression<T> = () => T | Promise<T>;

/**
 * Asserts that an expression is not truthy. Passes if `object` is `nil` or
 * `false`.
 *
 *   assert_not nil    # => true
 *   assert_not false  # => true
 *   assert_not 'foo'  # => Expected "foo" to be nil or false
 */
export function assertNot(object: unknown, message?: string | null): void {
  message ||= `Expected ${inspect(object)} to be nil or false`;
  assert(!(object != null && object !== false), message);
}

/**
 * Asserts that a block raises one of `exp`. This is an enhancement of the
 * standard assertion method with the ability to test error messages.
 *
 *   assert_raises(ArgumentError, match: /incorrect param/i) do
 *     perform_service(param: 'exception')
 *   end
 *
 * Ruby's `*exp` splat is an array here: a TS rest parameter cannot precede the
 * `match` kwarg and the block, which Ruby takes after it.
 */
export async function assertRaises(
  exp: (new (...args: any[]) => Error)[],
  { match }: { match?: RegExp | string | null } = {},
  block?: () => unknown,
): Promise<Error> {
  let error: Error | undefined;
  try {
    await block?.();
  } catch (e) {
    error = e as Error;
  }
  if (!error)
    throw new Assertion(`${exp.map((e) => e.name).join(", ")} expected but nothing was raised`);
  if (!exp.some((klass) => error instanceof klass)) {
    assert(false, `${exp.map((e) => e.name).join(", ")} expected, not ${error.name}`);
  }
  if (match) assertMatch(match, error.message);
  return error;
}

/** Alias of {@link assertRaises}. */
export async function assertRaise(
  exp: (new (...args: any[]) => Error)[],
  options: { match?: RegExp | string | null } = {},
  block?: () => unknown,
): Promise<Error> {
  return assertRaises(exp, options, block);
}

/**
 * Assertion that the block should not raise an exception.
 *
 * Passes if evaluated code in the yielded block raises no exception.
 */
export async function assertNothingRaised<T>(block: () => T | Promise<T>): Promise<T> {
  try {
    const retval = await block();
    assert(true);
    return retval;
  } catch (error) {
    throw new UnexpectedError(error as Error);
  }
}

/**
 * Test numeric difference between the return value of an expression as a
 * result of what is evaluated in the yielded block.
 *
 *   assert_difference ->{ Article.count } do
 *     post :create, params: { article: {...} }
 *   end
 *
 * An arbitrary positive or negative difference can be specified. The default
 * is +1+. A list of expressions, or a Map of expression => difference, can be
 * passed in place of a single expression.
 *
 * Ruby reads `*args` positionally: `args[0]` is the message when `expression`
 * is a Hash, and the difference (with `args[1]` the message) otherwise. The
 * rest parameter here carries the same positions, with the block last — Ruby
 * takes it as a block rather than in `*args`.
 *
 * @missingRailsCall map — `expressions.keys.map` (assertions.rb:112-114) exists
 * only to turn a String expression into `lambda { eval(e, block.binding) }`.
 * Every expression here is already a callable (see this file's header), so the
 * block is the identity and Rails' `map` has nothing left to do.
 */
export async function assertDifference<T>(
  expression: Map<Expression<number>, number>,
  ...args: [message?: string | null, block?: () => T | Promise<T>]
): Promise<T | undefined>;
export async function assertDifference<T>(
  expression: Expression<number> | Expression<number>[],
  ...args: [difference?: number, message?: string | null, block?: () => T | Promise<T>]
): Promise<T | undefined>;
export async function assertDifference<T>(
  expression: Expression<number> | Expression<number>[] | Map<Expression<number>, number>,
  ...args: unknown[]
): Promise<T | undefined> {
  const block =
    typeof args[args.length - 1] === "function" ? (args.pop() as () => T | Promise<T>) : undefined;

  let message: string | null | undefined;
  let expressions: Map<Expression<number>, number>;
  if (expression instanceof Map) {
    message = args[0] as string | null | undefined;
    expressions = expression;
  } else {
    const difference = (args[0] as number | undefined) ?? 1;
    message = args[1] as string | null | undefined;
    expressions = indexWith(Array.isArray(expression) ? expression : [expression], difference);
  }

  const exps = [...expressions.keys()];
  const before: number[] = [];
  for (const exp of exps) before.push(await exp());

  const retval = await _assertNothingRaisedOrWarn("assert_difference", block);

  for (const [index, exp] of exps.entries()) {
    const diff = expressions.get(exp) as number;
    const beforeValue = before[index];
    const actual = await exp();
    const richMessage = () => {
      let error = `\`${_callableToSourceString(exp)}\` didn't change by ${diff}, but by ${actual - beforeValue}`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assertEqual(beforeValue + diff, actual, richMessage);
  }

  return retval;
}

/**
 * Assertion that the numeric result of evaluating an expression is not
 * changed before and after invoking the passed in block.
 */
export async function assertNoDifference<T>(
  expression: Expression<number> | Expression<number>[] | Map<Expression<number>, number>,
  message: string | null = null,
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  return assertDifference(
    expression as Expression<number>,
    0,
    message,
    block as () => T | Promise<T>,
  );
}

/**
 * Assertion that the result of evaluating an expression is changed before
 * and after invoking the passed in block.
 *
 *   assert_changes -> { Status.all_good? } do
 *     post :create, params: { status: { ok: false } }
 *   end
 */
export async function assertChanges<T>(
  expression: Expression<unknown>,
  message: string | null = null,
  { from = UNTRACKED, to = UNTRACKED }: { from?: unknown; to?: unknown } = {},
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  const exp = expression;

  const before = await exp();
  const retval = await _assertNothingRaisedOrWarn("assert_changes", block);

  if (from !== UNTRACKED) {
    const richMessage = () => {
      let error = `Expected change from ${inspect(from)}, got ${inspect(before)}`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assert(caseEqual(from, before), richMessage);
  }

  const after = await exp();

  const richMessage = () => {
    let error = `\`${_callableToSourceString(expression)}\` didn't change`;
    if (Object.is(before, to)) error = `${error}. It was already ${inspect(to)}`;
    if (message) error = `${message}.\n${error}`;
    return error;
  };
  refuteEqual(before, after, richMessage);

  if (to !== UNTRACKED) {
    const richMessage = () => {
      let error = `Expected change to ${inspect(to)}, got ${inspect(after)}\n`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assert(caseEqual(to, after), richMessage);
  }

  return retval;
}

/**
 * Assertion that the result of evaluating an expression is not changed before
 * and after invoking the passed in block.
 */
export async function assertNoChanges<T>(
  expression: Expression<unknown>,
  message: string | null = null,
  { from = UNTRACKED }: { from?: unknown } = {},
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  const exp = expression;

  const before = await exp();
  const retval = await _assertNothingRaisedOrWarn("assert_no_changes", block);

  if (from !== UNTRACKED) {
    const richMessage = () => {
      let error = `Expected initial value of ${inspect(from)}, got ${inspect(before)}`;
      if (message) error = `${message}.\n${error}`;
      return error;
    };
    assert(caseEqual(from, before), richMessage);
  }

  const after = await exp();

  const richMessage = () => {
    let error = `\`${_callableToSourceString(expression)}\` changed`;
    if (message) error = `${message}.\n${error}`;
    return error;
  };

  if (before === null || before === undefined) {
    assertNil(after, richMessage);
  } else {
    assertEqual(before, after, richMessage);
  }

  return retval;
}

/** @internal */
export async function _assertNothingRaisedOrWarn<T>(
  assertion: string,
  block?: () => T | Promise<T>,
): Promise<T | undefined> {
  if (!block) return undefined;
  try {
    return await assertNothingRaised(block);
  } catch (e) {
    if (!(e instanceof UnexpectedError)) throw e;

    const logger = taggedLogger();
    if (logger && (logger as { "warn?"?: boolean })["warn?"]) {
      const warning =
        `${_testCaseIdentity()}: ${classNameOf(e.error)} raised.\n` +
        "If you expected this exception, use `assert_raises` as near to the code that raises as possible.\n" +
        `Other block based assertions (e.g. \`${assertion}\`) can be used, as long as \`assert_raises\` is inside their block.\n`;
      logger.warn(warning);
    }

    throw e;
  }
}

/**
 * Ruby reads the callable's source through `RubyVM::InstructionSequence` and
 * returns the lambda's BODY — `assert_difference -> { Article.count }` quotes
 * `Article.count` (assertions.rb:296-330). `Function#toString` is the JS
 * equivalent of the iseq source slice; the trimming below is Ruby's, in JS
 * spelling: only a zero-parameter arrow has a body worth quoting (Ruby returns
 * the callable itself otherwise), the braces and a `do`/`end`-style multi-line
 * body are stripped, and the trimmed body is kept only when it reads nice — a
 * single line, and not one taking arguments.
 *
 * @internal
 */
function _callableToSourceString(callable: unknown): string {
  const source = String(callable);
  const match = /^(?:async\s+)?\(\s*\)\s*=>\s*([\s\S]+)$/.exec(source.trim());
  if (!match) return source;

  let body = match[1].trim();
  if (body.startsWith("{")) {
    body = body.replace(/\}$/, "").replace(/^\{/, "").trim();
    body = body
      .replace(/^return\s+/, "")
      .replace(/;$/, "")
      .trim();
  }
  if (!body.includes("\n")) return body;

  return source;
}

/**
 * @noRailsEquivalent PERMANENT — Minitest's `assert`, which every assertion in
 * `testing/assertions.rb` and `testing/deprecation.rb` calls. Rails inherits it
 * from Minitest, so there is no Ruby counterpart in a mapped file; exported so
 * both testing modules raise the same `Assertion`.
 */
export function assert(value: boolean, message: string | (() => string) = ""): void {
  if (!value) throw new Assertion(typeof message === "function" ? message() : message);
}

/**
 * @noRailsEquivalent PERMANENT — Minitest's `assert_predicate` (minitest/assertions.rb).
 * Rails inherits it from Minitest, so there is no Ruby counterpart in a mapped
 * file. Ported tests call it where the Rails test does; a vitest matcher can
 * express the underlying check but not that it is a *predicate* assertion, which
 * is what `parity:test --assertions` compares.
 *
 * Ruby names the predicate with a method Symbol (`assert_predicate x, :nil?`);
 * JS has no universal `nil?`/`empty?` protocol to send, so the predicate is a
 * function applied to `actual`.
 */
export function assertPredicate<T>(
  actual: T,
  predicate: (value: T) => unknown,
  message?: string,
): void {
  const result = predicate(actual);
  assert(
    result != null && result !== false,
    message ?? `Expected ${inspect(actual)} to satisfy the predicate`,
  );
}

/**
 * @noRailsEquivalent PERMANENT — Minitest's `assert_same`
 * (minitest/assertions.rb), object identity rather than value equality.
 */
export function assertSame(expected: unknown, actual: unknown, message?: string): void {
  assert(
    Object.is(expected, actual),
    message ?? `Expected ${inspect(actual)} to be the same as ${inspect(expected)}`,
  );
}

/** @noRailsEquivalent PERMANENT — Minitest's `assert_not_same` / `refute_same`. */
export function assertNotSame(expected: unknown, actual: unknown, message?: string): void {
  assert(
    !Object.is(expected, actual),
    message ?? `Expected ${inspect(actual)} to not be the same as ${inspect(expected)}`,
  );
}

function assertEqual(expected: unknown, actual: unknown, message: () => string): void {
  assert(deepEqual(expected, actual), message);
}

function refuteEqual(expected: unknown, actual: unknown, message: () => string): void {
  assert(!deepEqual(expected, actual), message);
}

function assertNil(actual: unknown, message: () => string): void {
  assert(actual === null || actual === undefined, message);
}

function assertMatch(match: RegExp | string, actual: string): void {
  const matched = typeof match === "string" ? actual.includes(match) : match.test(actual);
  assert(matched, `Expected ${inspect(actual)} to match ${String(match)}`);
}

/** Ruby's `===`: a RegExp matches, a class is an instanceof, anything else `==`. */
function caseEqual(expected: unknown, actual: unknown): boolean {
  if (expected instanceof RegExp) return typeof actual === "string" && expected.test(actual);
  if (typeof expected === "function") return actual instanceof (expected as new () => unknown);
  return deepEqual(expected, actual);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return "nil";
  return String(value);
}

/**
 * The subset of Ruby's `IO` a reporter talks to (minitest.rb:748-764 types the
 * seat as `$stdout`): `print`, `puts`, `flush`, and the `sync` flag
 * `SummaryReporter#start` flips (minitest.rb:924-925).
 *
 * @noRailsEquivalent PERMANENT — Ruby's `IO`, from core, not from a Rails file
 * the comparator maps; declared here so the reporters below can name the
 * receiver Ruby leaves duck-typed. See {@link Assertion}.
 */
export interface IO {
  print(str: string): void;
  puts(str?: string): void;
  flush?(): void;
  sync?: boolean;
}

/**
 * Ruby's `StringIO`, which {@link SummaryReporter#toString} renders into
 * (minitest.rb:962).
 */
class StringIO implements IO {
  string = "";

  print(str: string): void {
    this.string += str;
  }

  puts(str = ""): void {
    this.string += str.endsWith("\n") ? str : `${str}\n`;
  }
}

/**
 * Ruby's `io.respond_to? :"sync="` (minitest.rb:924) — asks for the SETTER, not
 * for a readable `sync`, so an IO exposing a read-only `sync` answers false and
 * keeps {@link SummaryReporter#start} from assigning to it. JS has no
 * `respond_to?`, and `"sync" in io` would answer true for that read-only case,
 * so the property descriptor is what carries the question.
 */
function respondToSyncWriter(io: IO): boolean {
  for (
    let obj: object | null = io;
    obj !== null;
    obj = Object.getPrototypeOf(obj) as object | null
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, "sync");
    if (descriptor) return descriptor.set !== undefined || descriptor.writable === true;
  }
  return false;
}

/** Ruby's `$stdout`, the `io` every reporter defaults to (minitest.rb:759). */
const $stdout: IO = {
  print(str: string): void {
    stdout.write(str);
  },
  puts(str = ""): void {
    stdout.write(str.endsWith("\n") ? str : `${str}\n`);
  },
  flush(): void {},
  sync: true,
};

/**
 * The options hash minitest builds in `Minitest.process_args`
 * (minitest.rb:142-259) and hands every reporter. Ruby's keys are Symbols; the
 * `:show_skips` / `:Werror` spellings camelCase per docs/ruby-ts-conventions.md
 * (`Werror` is already a single token).
 *
 * @noRailsEquivalent PERMANENT — a type for minitest's untyped options hash;
 * see {@link Assertion}.
 */
export interface Options {
  io?: IO;
  args?: string;
  verbose?: boolean;
  quiet?: boolean;
  showSkips?: boolean;
  skip?: string[];
  Werror?: boolean;
  profile?: number;
  [key: string]: unknown;
}

/**
 * The `Minitest::Reportable` surface (minitest.rb:596-642) a reporter receives:
 * `Minitest::Test` and `Minitest::Result` both mix it in. trails runs its tests
 * under vitest, which owns the run lifecycle, so the runnable half of the gem
 * is not ported — this is the shape a reporter reads off whatever the runner
 * records.
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export interface Reportable {
  name: string;
  assertions: number;
  time: number;
  failure: Assertion | null;
  passed(): boolean;
  skipped(): boolean;
  resultCode(): string;
  toString(): string;
}

/**
 * Mirrors `Minitest::AbstractReporter` (minitest.rb:702-746) — the API a
 * reporter overrides. Ruby's `@mutex` guards a parallel run; JS has no threads,
 * so {@link AbstractReporter#synchronize} just calls the block.
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export class AbstractReporter {
  /** Starts reporting on the run. */
  start(): void {}

  /** About to start running a test. */
  prerecord(_klass: { name: string }, _name: string): void {}

  /** Output and record the result of the test. */
  record(_result: Reportable): void {}

  /** Outputs the summary of the run. */
  report(): void {}

  /** Did this run pass? */
  passed(): boolean {
    return true;
  }

  synchronize<T>(block: () => T): T {
    return block();
  }
}

/**
 * Mirrors `Minitest::Reporter` (minitest.rb:748-764).
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export class Reporter extends AbstractReporter {
  /** The IO used to report. */
  io: IO;

  /** Command-line options for this run. */
  options: Options;

  constructor(io: IO = $stdout, options: Options = {}) {
    super();
    this.io = io;
    this.options = options;
  }
}

/**
 * Mirrors `Minitest::ProgressReporter` (minitest.rb:774-787) — the reporter
 * that prints the "dots" during the run, and the one
 * `Minitest.plugin_rails_init` swaps for `Rails::TestUnitReporter`
 * (rails_plugin.rb:129-131).
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export class ProgressReporter extends Reporter {
  override prerecord(klass: { name: string }, name: string): void {
    if (this.options.verbose !== true) return;

    this.io.print(`${klass.name}#${name} = `);
    this.io.flush?.();
  }

  override record(result: Reportable): void {
    if (this.options.verbose === true) this.io.print(`${result.time.toFixed(2)} s = `);
    this.io.print(result.resultCode());
    if (this.options.verbose === true) this.io.puts();
  }
}

/**
 * Mirrors `Minitest::StatisticsReporter` (minitest.rb:810-901) — gathers
 * statistics about a test run, does no IO of its own.
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export class StatisticsReporter extends Reporter {
  /** Total number of assertions. */
  assertions = 0;

  /** Total number of test cases. */
  count = 0;

  /** Test cases that failed or were skipped. */
  results: Reportable[] = [];

  /** Time the test run started. */
  startTime: number | null = null;

  /** Test run time. */
  totalTime: number | null = null;

  /** Total number of tests that failed. */
  failures: number | null = null;

  /** Total number of tests that erred. */
  errors: number | null = null;

  /** Total number of tests that warned. */
  warnings: number | null = null;

  /** Total number of tests that were skipped. */
  skips: number | null = null;

  override passed(): boolean {
    return this.results.every((r) => r.skipped());
  }

  override start(): void {
    this.startTime = Minitest.clockTime();
  }

  override record(result: Reportable): void {
    this.count += 1;
    this.assertions += result.assertions;

    if (!result.passed() || result.skipped()) this.results.push(result);
  }

  /** Report on the tracked statistics. */
  override report(): void {
    const aggregate = new Map<unknown, Reportable[]>();
    for (const r of this.results) {
      const klass = r.failure?.constructor;
      const bucket = aggregate.get(klass);
      if (bucket) bucket.push(r);
      else aggregate.set(klass, [r]);
    }

    this.totalTime = Minitest.clockTime() - (this.startTime as number);
    this.failures = (aggregate.get(Assertion) ?? []).length;
    this.errors = (aggregate.get(UnexpectedError) ?? []).length;
    this.warnings = (aggregate.get(UnexpectedWarning) ?? []).length;
    this.skips = (aggregate.get(Skip) ?? []).length;
  }
}

/**
 * Mirrors `Minitest::SummaryReporter` (minitest.rb:912-979) — prints the
 * header, summary, and failure details at the end of the run, and the reporter
 * `Minitest.plugin_rails_init` swaps for `SuppressedSummaryReporter`
 * (rails_plugin.rb:126-128).
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export class SummaryReporter extends StatisticsReporter {
  sync: boolean | null = null;
  oldSync: boolean | null = null;

  override start(): void {
    super.start();

    this.io.puts(`Run options: ${String(this.options.args ?? "")}`);
    this.io.puts();
    this.io.puts("# Running:");
    this.io.puts();

    this.sync = respondToSyncWriter(this.io);
    if (this.sync) {
      this.oldSync = this.io.sync ?? null;
      this.io.sync = true;
    }
  }

  override report(): void {
    super.report();

    this.io.sync = this.oldSync ?? undefined;

    if (this.options.verbose !== true) this.io.puts();
    this.io.puts();
    this.io.puts(this.statistics());
    this.aggregatedResults(this.io);
    this.io.puts(this.summary());
  }

  statistics(): string {
    const totalTime = this.totalTime as number;
    return (
      `Finished in ${totalTime.toFixed(6)}s, ` +
      `${(this.count / totalTime).toFixed(4)} runs/s, ` +
      `${(this.assertions / totalTime).toFixed(4)} assertions/s.`
    );
  }

  aggregatedResults(io: IO): IO {
    let filteredResults = [...this.results];
    if (this.options.verbose !== true && this.options.showSkips !== true)
      filteredResults = filteredResults.filter((r) => !r.skipped());

    const skip = this.options.skip ?? [];

    filteredResults.forEach((result, i) => {
      if (skip.includes(result.resultCode())) return;

      io.puts(`\n${String(i + 1).padStart(3, " ")}) ${String(result)}`);
    });
    io.puts();
    return io;
  }

  override toString(): string {
    return (this.aggregatedResults(new StringIO()) as StringIO).string;
  }

  summary(): string {
    const extra: string[] = [];

    if (this.options.Werror === true) extra.push(`, ${this.warnings} warnings`);

    if (
      this.results.some((r) => r.skipped()) &&
      this.options.verbose !== true &&
      this.options.showSkips !== true &&
      env.MT_NO_SKIP_MSG == null
    )
      extra.push("\n\nYou have skipped tests. Run with --verbose for details.");

    return (
      `${this.count} runs, ${this.assertions} assertions, ${this.failures} failures, ` +
      `${this.errors} errors, ${this.skips} skips${extra.join("")}`
    );
  }
}

/**
 * Mirrors `Minitest::CompositeReporter` (minitest.rb:984-1030) — dispatch to
 * multiple reporters as one. This is the receiver
 * `Minitest.plugin_rails_init` rejects from and appends to
 * (rails_plugin.rb:122-135).
 *
 * @noRailsEquivalent PERMANENT — minitest's, not Rails'; see {@link Assertion}.
 */
export class CompositeReporter extends AbstractReporter {
  /** The list of reporters to dispatch to. */
  reporters: AbstractReporter[];

  constructor(...reporters: AbstractReporter[]) {
    super();
    this.reporters = reporters;
  }

  get io(): IO {
    return (this.reporters[0] as Reporter).io;
  }

  /**
   * Mirrors `Minitest::CompositeReporter#<<` (minitest.rb:1002-1004). TypeScript
   * has no `<<` to overload, so the operator keeps its Ruby name spelled out —
   * `Array#<<` is `push` on both sides of the port.
   */
  push(reporter: AbstractReporter): void {
    this.reporters.push(reporter);
  }

  override passed(): boolean {
    return this.reporters.every((r) => r.passed());
  }

  override start(): void {
    this.reporters.forEach((r) => r.start());
  }

  /**
   * Mirrors `Minitest::CompositeReporter#prerecord` (minitest.rb:1014-1019).
   * Ruby guards each dispatch with `if reporter.respond_to? :prerecord` — its
   * own `# TODO: remove conditional for minitest 6` — which a
   * {@link AbstractReporter}-typed element cannot fail, so the guard has no
   * arm to port.
   */
  override prerecord(klass: { name: string }, name: string): void {
    this.reporters.forEach((reporter) => {
      reporter.prerecord(klass, name);
    });
  }

  override record(result: Reportable): void {
    this.reporters.forEach((reporter) => {
      reporter.record(result);
    });
  }

  override report(): void {
    this.reporters.forEach((r) => r.report());
  }
}
