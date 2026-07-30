export {
    applyLegacyMigration,
    planLegacyMigration
} from "./legacy.js";
export {
    SCHEMA_MIGRATIONS,
    applySchemaMigration,
    inspectSchemaVersion,
    planSchemaMigration
} from "./schema.js";
export type { SchemaMigration } from "./schema.js";
