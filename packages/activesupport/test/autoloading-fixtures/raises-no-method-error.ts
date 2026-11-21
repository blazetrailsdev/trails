export class RaisesNoMethodError {
  static {
    (this as unknown as { foobarMethodDoesntExist(): void }).foobarMethodDoesntExist();
  }
}
