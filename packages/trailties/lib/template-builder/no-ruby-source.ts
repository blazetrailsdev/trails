const RUBY_RE =
  /^\s*(?:def\s+\w+|(?:class|module)\s+[A-Z]\w*(?:::\w+)*\s*(?:$|[;#]|<\s+(?:::)?[A-Z]\w*(?:::\w+)*\s*(?:#.*)?$))/m;

export function assertNoRubySource(text: string): void {
  const m = text.match(RUBY_RE);
  if (m) {
    throw new Error(`Ruby-like source detected: ${JSON.stringify(m[0])}`);
  }
}
