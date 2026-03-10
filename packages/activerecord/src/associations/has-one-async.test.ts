/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "../index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "../associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("AsyncHasOneAssociationsTest", () => {
  it("async load has one", async () => {
    const adapter = freshAdapter();
    class AHFirm extends Base {
      static { this._tableName = "ah_firms"; this.attribute("name", "string"); this.adapter = adapter; }
    }
    class AHAccount extends Base {
      static { this._tableName = "ah_accounts"; this.attribute("credit_limit", "integer"); this.attribute("ah_firm_id", "integer"); this.adapter = adapter; }
    }
    Associations.hasOne.call(AHFirm, "ahAccount", { foreignKey: "ah_firm_id", className: "AHAccount" });
    registerModel("AHFirm", AHFirm);
    registerModel("AHAccount", AHAccount);
    const firm = await AHFirm.create({ name: "Test Corp" });
    await AHAccount.create({ credit_limit: 100, ah_firm_id: firm.id });
    const account = await loadHasOne(firm, "ahAccount", { className: "AHAccount", foreignKey: "ah_firm_id" });
    expect(account).not.toBeNull();
    expect(account!.readAttribute("credit_limit")).toBe(100);
  });
});
