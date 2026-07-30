import { ValidationError } from "../../core/errors.js";
import { buildAgentContext } from "../agents/index.js";
import { requiredString } from "./values.js";

const PROMPTS = [
    {
        name: "start-work",
        title: "Start work on a card",
        description:
            "Prepare a safe execution prompt with bounded project context and claim instructions.",
        arguments: [
            {
                name: "cardId",
                description: "Stable Work card ID, for example T-0042.",
                required: true
            },
            {
                name: "actor",
                description: "Agent or session identifier that will claim the card.",
                required: false
            }
        ]
    },
    {
        name: "finish-work",
        title: "Finish work on a card",
        description:
            "Prepare verification, documentation, changelog and status-transition checks before ending a task.",
        arguments: [
            { name: "cardId", description: "Stable Work card ID.", required: true },
            {
                name: "outcome",
                description: "Brief description of what was implemented.",
                required: false
            }
        ]
    },
    {
        name: "record-knowledge",
        title: "Record durable project knowledge",
        description:
            "Choose the correct memory collection and create a well-linked durable record.",
        arguments: [
            {
                name: "observation",
                description: "The knowledge, decision, incident or convention to record.",
                required: true
            },
            {
                name: "sourceId",
                description: "Optional card or record ID that produced the knowledge.",
                required: false
            }
        ]
    }
].sort((left, right) => left.name.localeCompare(right.name));

export function listMcpPrompts() {
    return { prompts: PROMPTS };
}

export async function getMcpPrompt(context, params: any = {}) {
    const name = requiredString(params.name, "name");
    const args = params.arguments || {};
    if (name === "start-work") {
        const cardId = requiredString(args.cardId, "cardId");
        const actor = args.actor || "current-agent-session";
        const bundle = await buildAgentContext(context.workspace, {
            cardId,
            limit: 20
        });
        return {
            description: `Start work safely on ${cardId}.`,
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `${bundle.markdown}\n\n## Execution protocol\n\n1. Read the canonical source files needed for the task.\n2. Claim ${cardId} as ${actor} with project_card_claim before modifying its scope.\n3. Keep pending discoveries out of informal TODOs: create related cards.\n4. Record durable knowledge in the appropriate Memory collection.\n5. Run project_doctor before finishing.\n6. Move to review until runtime verification exists; use done only with evidence in a running environment.`
                    }
                }
            ]
        };
    }
    if (name === "finish-work") {
        const cardId = requiredString(args.cardId, "cardId");
        const bundle = await buildAgentContext(context.workspace, {
            cardId,
            limit: 20
        });
        return {
            description: `Finish and verify ${cardId}.`,
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `${bundle.markdown}\n\n## Finish checklist\n\nOutcome: ${args.outcome || "Describe the implemented result."}\n\n- Verify acceptance criteria and relevant tests.\n- Update managed docs when behavior or architecture changed.\n- Add an atomic changelog fragment when the change is release-relevant.\n- Record reusable learnings, decisions, incidents or conventions.\n- Create cards for remaining work.\n- Run project_doctor.\n- Transition ${cardId} to review unless the result is already verified in a running environment.`
                    }
                }
            ]
        };
    }
    if (name === "record-knowledge") {
        const observation = requiredString(args.observation, "observation");
        const source = args.sourceId ? ` Relate it to ${args.sourceId}.` : "";
        return {
            description: "Classify and persist durable project knowledge.",
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Record this project knowledge using Workfile:\n\n${observation}\n\nSearch for duplicates first.${source}\n\nChoose exactly one primary collection:\n- learnings: reusable observation whose evidence may accumulate;\n- decisions: explicit architecture, product or operational choice;\n- incidents: operational event with impact and corrective actions;\n- conventions: durable rule humans and agents must follow;\n- context: useful but temporary project state with expiry or review.\n\nDo not store secrets. Link related records and use graduation or supersession when knowledge evolves.`
                    }
                }
            ]
        };
    }
    throw new ValidationError("MCP_PROMPT_NOT_FOUND", `Unknown MCP prompt: ${name}`);
}
