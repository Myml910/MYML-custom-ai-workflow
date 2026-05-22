const INTENT_RULES = [
    {
        skillName: "canvas.summarizeWorkflow",
        patterns: [
            /总结当前画布/i,
            /总结画布/i,
            /workflow\s+summary/i,
        ],
    },
    {
        skillName: "canvas.inspectSelectedNodes",
        patterns: [
            /当前选中了什么/i,
            /选中节点/i,
            /selected/i,
        ],
    },
    {
        skillName: "canvas.findFailedNodes",
        patterns: [
            /失败/i,
            /报错/i,
            /错误节点/i,
        ],
    },
    {
        skillName: "canvas.listRunningTasks",
        patterns: [
            /运行中/i,
            /任务.*运行/i,
            /运行.*任务/i,
            /排队/i,
            /进度/i,
            /\btask\b/i,
        ],
    },
    {
        skillName: "canvas.explainGenerationChain",
        patterns: [
            /链路/i,
            /关系/i,
            /父子/i,
            /生成链/i,
        ],
    },
];

function normalizeUserMessage(userMessage) {
    if (typeof userMessage === "string") {
        return userMessage.trim();
    }

    if (Array.isArray(userMessage)) {
        return userMessage
            .map(part => {
                if (typeof part === "string") return part;
                if (part?.type === "text") return part.text || "";
                return "";
            })
            .join("\n")
            .trim();
    }

    return "";
}

export function routeCanvasSkillIntent(userMessage) {
    const text = normalizeUserMessage(userMessage);
    if (!text) return null;

    for (const rule of INTENT_RULES) {
        const matchedPattern = rule.patterns.find(pattern => pattern.test(text));
        if (matchedPattern) {
            return {
                skillName: rule.skillName,
                matched: true,
                matchedText: matchedPattern.source,
            };
        }
    }

    return null;
}

export function listIntentRules() {
    return INTENT_RULES.map(rule => ({
        skillName: rule.skillName,
        patterns: rule.patterns.map(pattern => pattern.source),
    }));
}

export default {
    routeCanvasSkillIntent,
    listIntentRules,
};
