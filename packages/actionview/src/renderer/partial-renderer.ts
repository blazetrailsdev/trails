import type { LookupContext } from "../lookup-context.js";
import { AbstractRenderer, RenderedTemplate } from "./abstract-renderer.js";
import type { ViewContext } from "./abstract-renderer.js";

const PENDING = "not yet implemented — pending Phase 3c.";

/**
 * ActionView::PartialRenderer
 *
 * Renders a single named partial. Phase 3c implements full partial resolution,
 * local-variable binding, and `strict_locals!` enforcement.
 * @internal
 */
export class PartialRenderer extends AbstractRenderer {
  constructor(lookupContext: LookupContext) {
    super(lookupContext);
  }

  render(_partial: string, _context: ViewContext, _block: unknown): RenderedTemplate {
    throw new Error(`PartialRenderer is ${PENDING}`);
  }
}

/**
 * ActionView::ObjectRenderer
 *
 * Renders a partial inferred from `object.toPartialPath()`. Phase 3c.
 * @internal
 */
export class ObjectRenderer extends AbstractRenderer {
  constructor(lookupContext: LookupContext) {
    super(lookupContext);
  }

  renderObjectWithPartial(
    _object: unknown,
    _partial: string,
    _context: ViewContext,
    _block: unknown,
  ): RenderedTemplate {
    throw new Error(`ObjectRenderer is ${PENDING}`);
  }

  renderObjectDerivePartial(
    _object: unknown,
    _context: ViewContext,
    _block: unknown,
  ): RenderedTemplate {
    throw new Error(`ObjectRenderer is ${PENDING}`);
  }

  render(): RenderedTemplate {
    throw new Error(`ObjectRenderer is ${PENDING}`);
  }
}

/**
 * ActionView::CollectionRenderer
 *
 * Renders a partial for each element in a collection. Phase 3c.
 * @internal
 */
export class CollectionRenderer extends AbstractRenderer {
  constructor(lookupContext: LookupContext) {
    super(lookupContext);
  }

  renderCollectionWithPartial(
    _collection: readonly unknown[],
    _partial: string,
    _context: ViewContext,
    _block: unknown,
  ): RenderedTemplate {
    throw new Error(`CollectionRenderer is ${PENDING}`);
  }

  renderCollectionDerivePartial(
    _collection: readonly unknown[],
    _context: ViewContext,
    _block: unknown,
  ): RenderedTemplate {
    throw new Error(`CollectionRenderer is ${PENDING}`);
  }

  render(): RenderedTemplate {
    throw new Error(`CollectionRenderer is ${PENDING}`);
  }
}
