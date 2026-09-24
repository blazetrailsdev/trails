import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import type { AssociationRelation as AssociationRelationClass } from "./association-relation.js";
import type { BelongsToAssociation } from "./associations/belongs-to-association.js";
import type { BelongsToPolymorphicAssociation } from "./associations/belongs-to-polymorphic-association.js";
import type { CollectionProxy } from "./associations/collection-proxy.js";
import type { DisableJoinsAssociationScope } from "./associations/disable-joins-association-scope.js";
import type { HasManyAssociation } from "./associations/has-many-association.js";
import type { HasManyThroughAssociation } from "./associations/has-many-through-association.js";
import type { HasOneAssociation } from "./associations/has-one-association.js";
import type { HasOneThroughAssociation } from "./associations/has-one-through-association.js";
import type { Base } from "./base.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import type * as ConnectionHandling from "./connection-handling.js";
import type { Configurable } from "./encryption/configurable.js";
import type { FixtureError } from "./fixtures.js";
import type * as Compatibility from "./migration/compatibility.js";
import type * as ModelSchema from "./model-schema.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "active_record/base": () => import("./base.js"),
  "active_record/connection_handling": () => import("./connection-handling.js"),
  "active_record/fixtures": () => import("./fixtures.js"),
  "active_record/model_schema": () => import("./model-schema.js"),
  "active_record/association_relation": () => import("./association-relation.js"),
  "active_record/associations/collection_proxy": () => import("./associations/collection-proxy.js"),
  "active_record/associations/belongs_to_association": () =>
    import("./associations/belongs-to-association.js"),
  "active_record/associations/belongs_to_polymorphic_association": () =>
    import("./associations/belongs-to-polymorphic-association.js"),
  "active_record/associations/has_many_association": () =>
    import("./associations/has-many-association.js"),
  "active_record/associations/has_many_through_association": () =>
    import("./associations/has-many-through-association.js"),
  "active_record/associations/has_one_association": () =>
    import("./associations/has-one-association.js"),
  "active_record/associations/has_one_through_association": () =>
    import("./associations/has-one-through-association.js"),
  "active_record/associations/disable_joins_association_scope": () =>
    import("./associations/disable-joins-association-scope.js"),
  "active_record/encryption/configurable": () => import("./encryption/configurable.js"),
  "active_record/migration/compatibility": () => import("./migration/compatibility.js"),
  "active_record/connection_adapters/abstract/connection_pool": () =>
    import("./connection-adapters/abstract/connection-pool.js"),
};

export const ActiveRecord = { name: "ActiveRecord", loadPath } as AutoloadModule & {
  Base: typeof Base;
  ConnectionHandling: typeof ConnectionHandling;
  FixtureError: typeof FixtureError;
  ModelSchema: typeof ModelSchema;
  AssociationRelation: typeof AssociationRelationClass;
  Point: new (x: number, y: number) => { x: number; y: number; equals(other: unknown): boolean };
};
extend(ActiveRecord, Autoload);
ActiveRecord.autoload("Base");
ActiveRecord.autoload("ConnectionHandling");
ActiveRecord.autoload("FixtureError", "active_record/fixtures");
ActiveRecord.autoload("ModelSchema");
ActiveRecord.eagerAutoload(() => {
  ActiveRecord.autoload("AssociationRelation");
});

export const Associations = { name: "ActiveRecord::Associations", loadPath } as AutoloadModule & {
  CollectionProxy: typeof CollectionProxy;
  BelongsToAssociation: typeof BelongsToAssociation;
  BelongsToPolymorphicAssociation: typeof BelongsToPolymorphicAssociation;
  HasManyAssociation: typeof HasManyAssociation;
  HasManyThroughAssociation: typeof HasManyThroughAssociation;
  HasOneAssociation: typeof HasOneAssociation;
  HasOneThroughAssociation: typeof HasOneThroughAssociation;
  DisableJoinsAssociationScope: typeof DisableJoinsAssociationScope;
};
extend(Associations, Autoload);
Associations.autoload("CollectionProxy");
Associations.eagerAutoload(() => {
  Associations.autoload("BelongsToAssociation");
  Associations.autoload("BelongsToPolymorphicAssociation");
  Associations.autoload("HasManyAssociation");
  Associations.autoload("HasManyThroughAssociation");
  Associations.autoload("HasOneAssociation");
  Associations.autoload("HasOneThroughAssociation");
  Associations.autoload("DisableJoinsAssociationScope");
});

export const ConnectionAdapters = {
  name: "ActiveRecord::ConnectionAdapters",
  loadPath,
} as AutoloadModule & {
  ConnectionPool: typeof ConnectionPool;
};
extend(ConnectionAdapters, Autoload);
ConnectionAdapters.autoloadAt("active_record/connection_adapters/abstract/connection_pool", () => {
  ConnectionAdapters.autoload("ConnectionPool");
});

export const Encryption = { name: "ActiveRecord::Encryption", loadPath } as AutoloadModule & {
  Configurable: typeof Configurable;
};
extend(Encryption, Autoload);
Encryption.eagerAutoload(() => {
  Encryption.autoload("Configurable");
});

export const Migration = { name: "ActiveRecord::Migration", loadPath } as AutoloadModule & {
  Compatibility: typeof Compatibility;
};
extend(Migration, Autoload);
Migration.autoload("Compatibility", "active_record/migration/compatibility");
