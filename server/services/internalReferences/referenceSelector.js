function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeToken(value) {
    return cleanString(value).toLowerCase();
}

function normalizeTagList(value) {
    if (!value) return [];
    const rawItems = Array.isArray(value) ? value : String(value).split(/[,\n;；、|]+/);
    return [...new Set(rawItems.map(normalizeToken).filter(Boolean))];
}

function overlapScore(left = [], right = [], weight = 1) {
    if (!left.length || !right.length) return 0;
    const rightSet = new Set(right);
    return left.reduce((score, tag) => score + (rightSet.has(tag) ? weight : 0), 0);
}

function normalizeUsabilityScore(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed > 1 ? Math.min(parsed, 100) / 20 : parsed * 5;
}

function inferProductType(text) {
    const source = cleanString(text).toLowerCase();
    const candidates = [
        ['travel_mug', ['汽车杯', '杯身', 'mug', 'cup', 'tumbler']],
        ['cosmetic_bag', ['化妆包', 'makeup bag', 'cosmetic bag']],
        ['sock', ['袜子', 'sock']],
        ['bracelet', ['手串', 'bracelet', 'charm']],
        ['keychain', ['钥匙扣', 'keychain', 'key chain']],
        ['badge', ['徽章', 'badge']],
        ['rug', ['地毯', 'rug', 'carpet']]
    ];

    for (const [productType, keywords] of candidates) {
        if (keywords.some(keyword => source.includes(keyword))) {
            return productType;
        }
    }
    return '';
}

function inferPrintMode(text) {
    const source = cleanString(text).toLowerCase();
    if (/(彩印|digital print|digital-print|print|printed)/i.test(source)) return 'digital_print';
    if (/(刺绣|embroider)/i.test(source)) return 'embroidery';
    if (/(提花|jacquard)/i.test(source)) return 'jacquard';
    if (/(钢色|metal|steel)/i.test(source)) return 'metal_print';
    return '';
}

function extractKnownTags(text) {
    const source = cleanString(text).toLowerCase();
    const tags = [];
    const knownTags = [
        ['kpop', ['k-pop', 'kpop']],
        ['pink', ['粉', 'pink']],
        ['purple', ['紫', 'purple']],
        ['cute', ['可爱', 'cute']],
        ['gift', ['礼品', 'gift']],
        ['badge', ['徽章', 'badge']],
        ['heart', ['爱心', 'heart']],
        ['star', ['星', 'star']],
        ['bow', ['蝴蝶结', 'bow']],
        ['music', ['音乐', 'music']]
    ];

    for (const [tag, keywords] of knownTags) {
        if (keywords.some(keyword => source.includes(keyword))) {
            tags.push(tag);
        }
    }
    return tags;
}

export function buildTaskReferenceCriteria(task) {
    const input = task?.input && typeof task.input === 'object' && !Array.isArray(task.input)
        ? task.input
        : {};
    const searchableText = [
        input.title,
        input.targetSize,
        input.referenceUsage,
        input.prompt,
        input.finalPrompt,
        input.generationPrompt,
        task?.prompt
    ].filter(Boolean).join('\n');

    const productType = normalizeToken(input.productType || input.product) || inferProductType(searchableText);
    const printMode = normalizeToken(input.printMode) || inferPrintMode(searchableText);
    const inferredTags = extractKnownTags(searchableText);

    return {
        projectCode: normalizeToken(input.projectCode),
        designTaskId: normalizeToken(input.designTaskId),
        productType,
        printMode,
        themeTags: [...new Set([...normalizeTagList(input.themeTags), ...inferredTags])],
        styleTags: normalizeTagList(input.styleTags),
        colorTags: normalizeTagList(input.colorTags)
    };
}

function scoreAsset(asset, criteria) {
    if (normalizeToken(asset.approvedStatus) !== 'approved') return 0;

    const assetDesignTaskId = normalizeToken(asset.designTaskId);
    if (assetDesignTaskId && assetDesignTaskId !== criteria.designTaskId) return 0;

    let score = 0;
    if (criteria.projectCode && normalizeToken(asset.projectCode) === criteria.projectCode) score += 30;
    if (criteria.designTaskId && normalizeToken(asset.designTaskId) === criteria.designTaskId) score += 25;
    if (criteria.productType && normalizeToken(asset.productType) === criteria.productType) score += 18;
    if (criteria.printMode && normalizeToken(asset.printMode) === criteria.printMode) score += 12;

    score += overlapScore(criteria.themeTags, normalizeTagList(asset.themeTags), 4);
    score += overlapScore(criteria.styleTags, normalizeTagList(asset.styleTags), 3);
    score += overlapScore(criteria.colorTags, normalizeTagList(asset.colorTags), 3);
    score += normalizeUsabilityScore(asset.usabilityScore);

    return score;
}

export function selectInternalReferences(assets, criteria, maxImages) {
    const limit = Math.max(0, Number(maxImages) || 0);
    if (!limit) return [];

    return assets
        .map(asset => ({ asset, score: scoreAsset(asset, criteria) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.asset);
}
