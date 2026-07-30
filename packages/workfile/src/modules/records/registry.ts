import { ValidationError } from "../../core/errors.js";

/**
 * Lightweight collection registry shared by the indexer and future modules.
 * A collection owns discovery/normalization; the unified index owns search and
 * cross-collection relationships.
 */
export function createCollectionRegistry(initial = []) {
    const collections = new Map();

    function register(collection) {
        if (!collection?.id || typeof collection.load !== "function") {
            throw new ValidationError(
                "COLLECTION_DEFINITION_INVALID",
                "A collection requires a stable id and load(workspace) function."
            );
        }
        if (collections.has(collection.id)) {
            throw new ValidationError(
                "COLLECTION_ID_DUPLICATE",
                `Collection already registered: ${collection.id}`
            );
        }
        collections.set(collection.id, Object.freeze({ ...collection }));
        return api;
    }

    async function load(workspace) {
        const loaded = [];
        for (const collection of collections.values()) {
            if (
                collection.enabled &&
                !collection.enabled(workspace)
            ) {
                continue;
            }
            const result = await collection.load(workspace);
            loaded.push({ collection, result });
        }
        return loaded;
    }

    const api = {
        register,
        load,
        get: (id) => collections.get(id) || null,
        list: () => [...collections.values()]
    };
    for (const collection of initial) register(collection);
    return api;
}
