import { Autoload, extend, registerConstant, type Extended } from "@blazetrails/activesupport";
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
import type { register, resolve } from "./connection-adapters.js";
import type * as ConnectionHandling from "./connection-handling.js";
import type { DisableJoinsAssociationRelation } from "./disable-joins-association-relation.js";
import type { Cipher } from "./encryption/cipher.js";
import type { Configurable } from "./encryption/configurable.js";
import type { Contexts } from "./encryption/contexts.js";
import type { Fixture } from "./fixtures.js";
import type { Migration } from "./migration.js";
import type * as ModelSchema from "./model-schema.js";
import type { Relation } from "./relation.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "active_record/base": () => import("./base.js"),
  "active_record/associations": () => import("./associations.js"),
  "active_record/connection_adapters": () => import("./connection-adapters.js"),
  "active_record/encryption": () => import("./encryption.js"),
  "active_record/connection_handling": () => import("./connection-handling.js"),
  "active_record/fixtures": () => import("./fixtures.js"),
  "active_record/model_schema": () => import("./model-schema.js"),
  "active_record/association_relation": () => import("./association-relation.js"),
  "active_record/disable_joins_association_relation": () =>
    import("./disable-joins-association-relation.js"),
  "active_record/relation": () => import("./relation.js"),
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
  "active_record/encryption/cipher": () => import("./encryption/cipher.js"),
  "active_record/encryption/configurable": () => import("./encryption/configurable.js"),
  "active_record/migration": () => import("./migration.js"),
  "active_record/connection_adapters/abstract/connection_pool": () =>
    import("./connection-adapters/abstract/connection-pool.js"),
};

export const ActiveRecord = { name: "ActiveRecord", loadPath } as AutoloadModule & {
  Base: typeof Base;
  ConnectionHandling: typeof ConnectionHandling;
  Encryption: typeof Encryption;
  Fixture: typeof Fixture;
  Migration: typeof Migration;
  ModelSchema: typeof ModelSchema;
  AssociationRelation: typeof AssociationRelationClass;
  Associations: typeof Associations;
  ConnectionAdapters: typeof ConnectionAdapters;
  DisableJoinsAssociationRelation: typeof DisableJoinsAssociationRelation;
  Relation: typeof Relation;
  Point: new (x: number, y: number) => { x: number; y: number; equals(other: unknown): boolean };
};
registerConstant("ActiveRecord", ActiveRecord);
extend(ActiveRecord, Autoload);
ActiveRecord.autoload("Base");
ActiveRecord.autoload("ConnectionHandling");
ActiveRecord.autoload("Encryption");
ActiveRecord.autoload("Fixture", "active_record/fixtures");
ActiveRecord.autoload("Migration");
ActiveRecord.autoload("ModelSchema");
ActiveRecord.eagerAutoload(() => {
  ActiveRecord.autoload("AssociationRelation");
  ActiveRecord.autoload("Associations");
  ActiveRecord.autoload("ConnectionAdapters");
  ActiveRecord.autoload("DisableJoinsAssociationRelation");
  ActiveRecord.autoload("Relation");
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
  register: typeof register;
  resolve: typeof resolve;
};
extend(ConnectionAdapters, Autoload);
ConnectionAdapters.autoloadAt("active_record/connection_adapters/abstract/connection_pool", () => {
  ConnectionAdapters.autoload("ConnectionPool");
});

export const Encryption = { name: "ActiveRecord::Encryption", loadPath } as AutoloadModule & {
  Cipher: typeof Cipher;
  Configurable: typeof Configurable;
} & Omit<typeof Configurable, "prototype"> &
  Omit<typeof Contexts, "prototype">;
extend(Encryption, Autoload);
Encryption.eagerAutoload(() => {
  Encryption.autoload("Cipher");
  Encryption.autoload("Configurable");
});
