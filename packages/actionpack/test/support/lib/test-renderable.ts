export class TestRenderable {
  renderIn(_viewContext: unknown): string {
    return "Hello, World!";
  }

  format(): string {
    return ":html";
  }
}
