export class SaxDocument {
  startDocument(): void {}
  endDocument(): void {}
  startElement(_name: string, _attrs: ReadonlyArray<[string, string]>): void {}
  endElement(_name: string): void {}
  characters(_text: string): void {}
  cdataBlock(_text: string): void {}
  error(_message: string): void {}
}
