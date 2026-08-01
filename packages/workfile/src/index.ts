export type {
    AgentTarget,
    BaseProjectRecord,
    CardEffort,
    CardChanges,
    CardMutationOptions,
    CardPriority,
    CardRecord,
    CardStatus,
    CardType,
    ChangeRecord,
    ChangeVisibility,
    CiTarget,
    CreateCardInput,
    CreateChangeInput,
    CreateDocumentInput,
    CreateMemoryInput,
    CreateReleaseInput,
    DeepPartial,
    DocumentLayout,
    DoctorReport,
    DocumentRecord,
    EffectiveProjectSchema,
    HybridSearchOptions,
    MemoryCollection,
    MemoryRecord,
    ProjectAgentsConfig,
    ProjectCardsConfig,
    ProjectChangelogConfig,
    ProjectCiConfig,
    ProjectConfig,
    ProjectConfigInput,
    ProjectDiagnostic,
    ProjectDocsConfig,
    ProjectIntegration,
    ProjectIndex,
    ProjectMcpConfig,
    ProjectMemoryConfig,
    ProjectRecord,
    ProjectRecordLink,
    ProjectSearchConfig,
    ProjectSearchOptions,
    ProjectSearchResult,
    ProjectStorageConfig,
    ProjectUiConfig,
    ProjectWorkspace,
    ProjectWorkspacePaths,
    RecordMutationResult,
    ReleaseRecord,
    ReleaseStrategy,
    RevisionOptions,
    SemanticSearchMatch,
    SemanticSearchProvider,
    SemanticSearchRecord,
    WorkspaceVersion
} from "./types.js";
export { defineProject } from "./config/define-project.js";
export {
    assertValidProjectConfig,
    validateProjectConfig
} from "./config/validate-config.js";
export {
    AGENT_TARGET_IDS,
    CI_TARGET_IDS,
    CARD_EFFORTS,
    CARD_PRIORITIES,
    CARD_STATUSES,
    CARD_TYPES,
    CHANGE_TYPES,
    CHANGE_VISIBILITIES,
    DOC_KINDS,
    DOC_LAYOUTS,
    DOC_STATUSES,
    MEMORY_DEFINITIONS,
    DEFAULT_CONFIG,
    SCHEMA_VERSION
} from "./config/defaults.js";
export {
    DEFAULT_LIST_KEYS,
    parseFrontmatter,
    parseValue,
    patchFrontmatter,
    requireFrontmatter,
    serializeValue
} from "./core/frontmatter.js";
export { createFileExclusive, writeFileAtomic } from "./core/filesystem.js";
export { discoverFiles, globToRegExp, matchesAnyGlob, normalizeRepoPath } from "./core/glob.js";
export { containedPath, readMarkdownTree } from "./core/paths.js";
export type { ReadMarkdownTreeOptions } from "./core/paths.js";
export { resolveActor, resolveSessionId } from "./core/actor.js";
export type { ResolveActorOptions, ResolvedActor } from "./core/actor.js";
export {
    ConfigError,
    ConflictError,
    NotFoundError,
    ProtocolError,
    ValidationError,
    normalizeError
} from "./core/errors.js";
export type { ProtocolErrorOptions } from "./core/errors.js";
export { lockIsStale, readLockOwner, withFileLock } from "./core/locks.js";
export {
    defaultConcurrency,
    isResourceExhaustion,
    mapWithConcurrency
} from "./core/concurrency.js";
export { ensureWritable } from "./core/guards.js";
export { createWorkspaceWatcher } from "./core/watcher.js";
export { exists } from "./core/fs-utils.js";
export { revisionForContent } from "./core/revision.js";
export { discoverWorkspaceRoot } from "./workspace/discover.js";
export { effectiveSchema, loadWorkspace } from "./workspace/load-workspace.js";
export type { LoadWorkspaceOptions } from "./workspace/load-workspace.js";
export * from "./modules/cards/index.js";
export * from "./modules/docs/index.js";
export * from "./modules/changelog/index.js";
export * from "./modules/memory/index.js";
export * from "./modules/agents/index.js";
export * from "./modules/ci/index.js";
export * from "./modules/init/index.js";
export * from "./modules/migration/index.js";
export * from "./modules/claude/index.js";
export * from "./modules/records/public.js";
export * from "./modules/search/index.js";
export * from "./modules/integrations/index.js";
export * from "./modules/mcp/index.js";
export { runDoctor } from "./modules/health/doctor.js";
export {
    healDuplicateCardIds,
    renumberCard,
    reslugStaleCardFiles
} from "./modules/health/renumber.js";
export {
    baselineMissing,
    diffAgainstBaseline,
    issueKey,
    readDoctorBaseline,
    writeDoctorBaseline
} from "./modules/health/baseline.js";
export { runUpgrade } from "./modules/upgrade/index.js";

export { createProjectServer, startProjectServer } from "./server/http.js";
