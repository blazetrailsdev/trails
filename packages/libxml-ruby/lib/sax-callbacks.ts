import type { Error } from "./error.js";

export type Attributes = Record<string, string>;

export interface SaxCallbacks {
  onCdataBlock(cdata: string): void;
  onCharacters(chars: string): void;
  onComment(msg: string): void;
  onEndDocument(): void;
  onEndElement?(name: string): void;
  onEndElementNs(name: string, prefix: string | null, uri: string | null): void;
  onError(msg: Error): void;
  onExternalSubset(name: string | null, externalId: string | null, systemId: string | null): void;
  onHasExternalSubset(): void;
  onHasInternalSubset(): void;
  onInternalSubset(name: string | null, externalId: string | null, systemId: string | null): void;
  onIsStandalone(): void;
  onProcessingInstruction(target: string, data: string): void;
  onReference(name: string): void;
  onStartDocument(): void;
  onStartElement?(name: string, attributes: Attributes): void;
  onStartElementNs(
    name: string,
    attributes: Attributes,
    prefix: string | null,
    uri: string | null,
    namespaces: Record<string, string | null>,
  ): void;
}

export const Callbacks = {
  onCdataBlock(_cdata: string): void {},
  onCharacters(_chars: string): void {},
  onComment(_msg: string): void {},
  onEndDocument(): void {},
  onEndElementNs(_name: string, _prefix: string | null, _uri: string | null): void {},
  onError(_msg: Error): void {},
  onExternalSubset(_name: string | null, _externalId: string | null, _systemId: string | null) {},
  onHasExternalSubset(): void {},
  onHasInternalSubset(): void {},
  onInternalSubset(_name: string | null, _externalId: string | null, _systemId: string | null) {},
  onIsStandalone(): void {},
  onProcessingInstruction(_target: string, _data: string): void {},
  onReference(_name: string): void {},
  onStartDocument(): void {},
  onStartElementNs(
    _name: string,
    _attributes: Attributes,
    _prefix: string | null,
    _uri: string | null,
    _namespaces: Record<string, string | null>,
  ): void {},
} satisfies SaxCallbacks;
