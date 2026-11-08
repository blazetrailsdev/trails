export class ErrorBuffer {
  readonly errors: [Error, Record<string, unknown>][] = [];

  report(
    error: Error,
    {
      handled,
      severity,
      context,
      source = null,
    }: { handled: boolean; severity: string; context: unknown; source?: string | null },
  ): void {
    this.errors.push([error, { context, handled, level: severity, source }]);
  }

  messages(): string[] {
    return this.errors.map((error) => error[0].message);
  }
}
