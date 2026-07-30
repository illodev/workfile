export {
    buildProjectIndex,
    createDefaultCollectionRegistry,
    createProjectIndexStore,
    findProjectRecord,
    recordFromCard,
    recordFromChange,
    recordFromDocument,
    recordFromMemory,
    recordFromRelease,
    classifiedReferences,
    projectRecord,
    recordReferences,
    buildPostings,
    parseQuery,
    restorePostings,
    searchProjectRecords,
    serializePostings,
    workspaceFingerprint
} from "./index.js";
export { createCollectionRegistry } from "./registry.js";
export {
    INDEX_CACHE_FORMAT,
    clearIndexCache,
    indexConfigSignature,
    readIndexCache,
    writeIndexCache
} from "./cache.js";
