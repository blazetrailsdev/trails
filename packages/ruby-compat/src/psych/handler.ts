/**
 * `Psych::Handler::DumperOptions` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/handler.rb:16-27`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class DumperOptions {
  /** @noRailsEquivalent PERMANENT */
  lineWidth = 0;
  /** @noRailsEquivalent PERMANENT */
  indentation = 2;
  /** @noRailsEquivalent PERMANENT */
  canonical = false;
}

/**
 * `Psych::Handler` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/handler.rb:13`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Handler {
  /**
   * `Psych::Handler::OPTIONS` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/handler.rb:30`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static readonly OPTIONS: DumperOptions = new DumperOptions();

  /**
   * `Psych::Handler::EVENTS` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/handler.rb:33-43`).
   *
   * @noRailsEquivalent PERMANENT
   */
  static readonly EVENTS: readonly string[] = [
    "alias",
    "empty",
    "endDocument",
    "endMapping",
    "endSequence",
    "endStream",
    "scalar",
    "startDocument",
    "startMapping",
    "startSequence",
    "startStream",
  ];

  /** @noRailsEquivalent PERMANENT */
  startStream(_encoding: number): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  startDocument(
    _version: number[],
    _tagDirectives: [string, string][],
    _implicit: boolean,
  ): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  endDocument(_implicit: boolean): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  alias(_anchor: string): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  scalar(
    _value: string,
    _anchor: string | null,
    _tag: string | null,
    _plain: boolean,
    _quoted: boolean,
    _style: number,
  ): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  startSequence(
    _anchor: string | null,
    _tag: string | null,
    _implicit: boolean,
    _style: number,
  ): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  endSequence(): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  startMapping(
    _anchor: string | null,
    _tag: string | null,
    _implicit: boolean,
    _style: number,
  ): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  endMapping(): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  empty(): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  endStream(): unknown {
    return undefined;
  }

  /** @noRailsEquivalent PERMANENT */
  eventLocation(
    _startLine: number,
    _startColumn: number,
    _endLine: number,
    _endColumn: number,
  ): void {}

  /** @noRailsEquivalent PERMANENT */
  isStreaming(): boolean {
    return false;
  }
}
