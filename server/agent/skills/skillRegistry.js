import { canvasSkills } from "./canvasSkills.js";

const skillsByName = new Map();

for (const skill of canvasSkills) {
    if (!skill?.name) {
        throw new Error("Agent skill is missing a name.");
    }

    if (skillsByName.has(skill.name)) {
        throw new Error(`Duplicate agent skill registered: ${skill.name}`);
    }

    if (skill.readOnly !== true) {
        throw new Error(`Agent skill must be read-only: ${skill.name}`);
    }

    skillsByName.set(skill.name, skill);
}

export function listSkills() {
    return Array.from(skillsByName.values()).map(skill => ({
        name: skill.name,
        description: skill.description,
        readOnly: skill.readOnly === true,
    }));
}

export function getSkill(name) {
    return skillsByName.get(name) || null;
}

export async function executeSkill(name, { canvasContext, userMessage } = {}) {
    const skill = getSkill(name);
    if (!skill) {
        throw new Error(`Unknown agent skill: ${name}`);
    }

    if (skill.readOnly !== true) {
        throw new Error(`Refusing to execute non-read-only agent skill: ${name}`);
    }

    const result = await skill.execute({
        canvasContext,
        userMessage,
    });

    return {
        name: skill.name,
        description: skill.description,
        readOnly: true,
        result,
    };
}

export default {
    listSkills,
    getSkill,
    executeSkill,
};
