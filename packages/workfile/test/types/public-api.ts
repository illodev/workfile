import {
    CARD_STATUSES,
    ConfigError,
    defineProject,
    loadWorkspace,
    type CardStatus,
    type CreateCardInput,
    type ProjectConfig,
    type ProjectRecord,
    type ProjectWorkspace
} from "@illodev/workfile";
import { createCard } from "@illodev/workfile/cards";
import {
    createIntegrationRegistry,
    defineProjectIntegration
} from "@illodev/workfile/integrations";
import {
    createSemanticSearchProvider,
    searchProjectRecordsHybrid
} from "@illodev/workfile/search";

const config: ProjectConfig = defineProject({
    schemaVersion: 2,
    name: "Typed consumer",
    // Inert since ADR-0012 and kept compiling on purpose: every config `init`
    // generated before 0.6.x declares it, and a typed consumer must not have to
    // edit their config to upgrade. This line is the assertion.
    language: "es",
    cards: {
        areas: ["api", "web"]
    },
    agents: {
        targets: ["agents-md", "cursor"]
    },
    mcp: {
        allowMutations: false
    }
});

const status: CardStatus = CARD_STATUSES[0];
void status;

// @ts-expect-error schema 3 is not compatible with the schema-v2 API.
defineProject({ schemaVersion: 3 });

// @ts-expect-error invalid Work statuses are rejected at compile time.
const invalidStatus: CardStatus = "in-progress";
void invalidStatus;

const cardInput: CreateCardInput = {
    title: "Typed card",
    area: config.cards.areas[0],
    status: "backlog"
};

async function useWorkspace(root: string) {
    const workspace: ProjectWorkspace = await loadWorkspace({ root });
    const created = await createCard(workspace, cardInput);
    return created.card;
}

const provider = createSemanticSearchProvider({
    id: "typed-provider",
    async search({ records }) {
        return records.map((record, index) => ({
            id: record.id,
            score: 1 / (index + 1)
        }));
    }
});

const registry = createIntegrationRegistry([
    defineProjectIntegration({
        id: "typed.integration",
        semanticSearchProvider: provider,
        healthCheck() {
            return [];
        }
    })
]);
void registry;

async function search(records: ProjectRecord[]) {
    const result = await searchProjectRecordsHybrid(records, "typed", {
        provider,
        kinds: ["card", "doc"],
        limit: 10
    });
    return result.records;
}

void useWorkspace;
void search;
void ConfigError;
