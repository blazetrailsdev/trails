export class NullInflector {
  camelize(basename: string, _abspath: string | null): string {
    return basename;
  }
}
