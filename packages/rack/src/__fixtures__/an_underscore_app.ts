export class AnUnderscoreApp {
  static call(_env: Record<string, unknown>) {
    return [200, { "content-type": "text/plain" }, ["OK"]];
  }
}
