import crypto from 'crypto';

const DEFAULT_HERMES_BASE_URL = 'http://127.0.0.1:8642/v1';
const DEFAULT_HERMES_MODEL = 'hermes-agent';
const DEFAULT_HERMES_TIMEOUT_MS = 180000;

const MOCK_IMAGE_URLS = [
    '/workflow-sample-1.png',
    '/day-mode-with-chat-window.png'
];

const HERMES_API_SYSTEM_PROMPT = `You are the Hermes execution gateway for MYML Canvas.

You must load and follow the company-system project lookup skill:
Load skill_view(name="company-system:project-lookup")

Execution rules:
1. Extract projectCode from the user payload.
2. You must call company_project_lookup with projectCode.
3. The final output must be exactly one JSON object. Do not use markdown. Do not explain.
4. Do not query any other external system.
5. Do not generate real images.
6. Do not return external image URLs as generated results. External URLs are allowed only inside references.
7. Do not include API keys, headers, authorization values, raw upstream debug payloads, or internal secrets.
8. Do not download ref_img. Do not visit ref_link. Treat reference image/link fields as text-only project context.

Project preservation rules:
- Let toolProject be the complete object returned by company_project_lookup.
- The final project object must preserve every field from toolProject.
- The final project.companyFields must equal the complete toolProject object, not the simplified project object.
- Do not summarize, compress, omit, rename, or flatten unknown company fields.
- Preserve arrays and objects such as targetAudience, deliverables, constraints, styleReferences, assetHints, lookupStatus, source, mock, and updatedAt.

Add these MYML aliases to project without removing the original tool fields:
- code = projectCode
- name = projectName
- customer = customerName
- developmentRequirement = brief || objective
- craft = process || constraints.channels[0] || "\u6570\u7801\u5370\u82b1"
- sizeRequirement = "2K" if deliverables mentions 2K, otherwise "" or "2K"
- quantityRequirement = 4 if deliverables mentions 4 \u5f20, otherwise 1

Design proposal rules:
- If the user asks for "\u56fe\u6848\u8bbe\u8ba1\u63d0\u6848", "\u8bbe\u8ba1\u65b9\u6848", "\u8bbe\u8ba1\u7b56\u7565", "design task", "prompt", or any project-start request, create a pattern design proposal after project lookup.
- The proposal must be for pattern design, home product pattern direction, and production-ready repeatable surface design. Do not generate marketing copy.
- If category_label or usage_scenario_label is missing, infer conservatively from existing fields and record the uncertainty in constraints or task notes.
- Generate 3 to 6 designTasks. Every design task must include prompt and negativePrompt.
- generationReadiness.readyForImageGeneration must be false in P3-A.
- Do not call image generation. Do not create generated image URLs. Do not claim images have been generated.

Reference material rules:
- Extract reference images and reference links from company_project_lookup fields such as ref_img, ref_link, reference_image, reference_url, amazon_url, amazon_link, product_url, design_img, design_link, oper_img, and oper_link.
- If reference images or Amazon/product/reference links exist, put them into references.images or references.links.
- Do not download reference images. Do not visit reference links. Do not crawl Amazon.
- references only describes external pointers for the designer to inspect later.
- If references exist, designTasks should include referenceRequired, referenceIds, and referenceUsage.
- referenceUsage should explain how to use reference material for composition, pattern density, color direction, product proportion, and craft suitability, but must not copy trademarks, logos, or protected elements.
- Prompt text may describe how to use the references, but must not claim external pages or images were already read beyond the company fields.

The JSON object must match this MYML-compatible schema:
{
  "status": "completed",
  "project": {
    "projectCode": "YXF...",
    "projectId": "...",
    "projectName": "...",
    "customerName": "...",
    "brandName": "...",
    "businessUnit": "...",
    "category": "...",
    "objective": "...",
    "brief": "...",
    "targetAudience": [],
    "deliverables": [],
    "constraints": {},
    "styleReferences": [],
    "assetHints": [],
    "lookupStatus": "found",
    "source": "mock",
    "mock": true,
    "updatedAt": "...",
    "code": "YXF...",
    "name": "...",
    "customer": "...",
    "developmentRequirement": "...",
    "craft": "...",
    "sizeRequirement": "...",
    "quantityRequirement": 1,
    "companyFields": {
      "projectCode": "YXF...",
      "projectId": "...",
      "projectName": "...",
      "customerName": "...",
      "brandName": "...",
      "businessUnit": "...",
      "category": "...",
      "objective": "...",
      "brief": "...",
      "targetAudience": [],
      "deliverables": [],
      "constraints": {},
      "styleReferences": [],
      "assetHints": [],
      "lookupStatus": "found",
      "source": "mock",
      "mock": true,
      "updatedAt": "..."
    }
  },
  "strategy": {
    "selectedModel": "...",
    "reason": "...",
    "imageCount": 1,
    "size": "2K",
    "mode": "design-proposal"
  },
  "designTask": {
    "task_type": "pattern_design",
    "theme": "...",
    "prompt": "...",
    "negative_prompt": "..."
  },
  "projectBrief": {
    "projectCode": "YXF...",
    "projectName": "...",
    "customer": "...",
    "category": "...",
    "craft": "...",
    "size": "...",
    "quantity": "...",
    "deadline": "...",
    "designRequirement": "...",
    "constraints": []
  },
  "designStrategy": {
    "theme": "...",
    "visualDirection": "...",
    "targetUser": "...",
    "usageScenario": "...",
    "colorPalette": ["..."],
    "composition": "...",
    "styleKeywords": ["..."],
    "materialAndCraftNotes": ["..."],
    "avoid": ["..."]
  },
  "designTasks": [
    {
      "taskId": "concept_01",
      "title": "...",
      "targetSize": "2K",
      "purpose": "...",
      "prompt": "...",
      "negativePrompt": "...",
      "modelRecommendation": "custom-image-gpt-image-2",
      "referenceRequired": true,
      "referenceIds": ["ref_01", "link_01"],
      "referenceUsage": "Use the project references as visual context without claiming the links were crawled.",
      "notes": []
    }
  ],
  "references": {
    "images": [
      {
        "id": "ref_01",
        "url": "https://...",
        "source": "company_system",
        "label": "\u9879\u76ee\u53c2\u8003\u56fe",
        "role": "visual_reference",
        "safeToDisplay": true,
        "importedAssetId": null
      }
    ],
    "links": [
      {
        "id": "link_01",
        "url": "https://...",
        "source": "company_system",
        "label": "\u53c2\u8003\u94fe\u63a5",
        "type": "product_reference",
        "safeToOpen": true
      }
    ],
    "notes": []
  },
  "generationReadiness": {
    "readyForImageGeneration": false,
    "reason": "P3-A only generates design tasks and prompts. Image generation is handled by MYML-CANVAS later."
  },
  "results": []
}

Required result rules:
- strategy must include selectedModel, reason, imageCount, size, and mode.
- designTask must include task_type, theme, prompt, and negative_prompt.
- results may be omitted or empty in P3-A because no real image generation runs.`;

function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanBaseUrl(value) {
    const baseUrl = cleanString(value);
    return baseUrl ? baseUrl.replace(/\/+$/, '') : undefined;
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createHermesError(code, message, status = 502) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function normalizeClientMode(value) {
    const rawMode = cleanString(value);
    if (!rawMode) return 'mock';

    const mode = rawMode.toLowerCase();
    if (mode === 'mock' || mode === 'api') return mode;

    throw createHermesError(
        'HERMES_INVALID_CLIENT_MODE',
        'Invalid HERMES_CLIENT_MODE. Use "mock" or "api".',
        500
    );
}

export function getHermesClientConfig(env = process.env) {
    const mode = normalizeClientMode(env.HERMES_CLIENT_MODE);
    return {
        mode,
        baseUrl: cleanBaseUrl(env.HERMES_BASE_URL) || DEFAULT_HERMES_BASE_URL,
        apiKey: cleanString(env.HERMES_API_KEY),
        model: cleanString(env.HERMES_MODEL) || DEFAULT_HERMES_MODEL,
        timeoutMs: parsePositiveInteger(env.HERMES_TIMEOUT_MS, DEFAULT_HERMES_TIMEOUT_MS),
    };
}

export function getHermesStartupSummary(env = process.env) {
    const config = getHermesClientConfig(env);
    return {
        hermesClientMode: config.mode,
        hermesBaseUrl: config.baseUrl,
        hermesModel: config.model,
        hermesConfigured: config.mode === 'mock' || Boolean(config.apiKey),
        hermesTimeoutMs: config.timeoutMs,
    };
}

function getMockImageUrl(projectCode) {
    const index = Math.abs(
        String(projectCode || '')
            .split('')
            .reduce((sum, char) => sum + char.charCodeAt(0), 0)
    ) % MOCK_IMAGE_URLS.length;
    return MOCK_IMAGE_URLS[index];
}

function stripJsonFence(content) {
    const text = String(content || '').trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
    return fenced ? fenced[1].trim() : text;
}

function parseHermesJsonContent(content) {
    const stripped = stripJsonFence(content);
    if (!stripped) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API returned an empty response.',
            502
        );
    }

    try {
        return JSON.parse(stripped);
    } catch {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API returned non-JSON content.',
            502
        );
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_FIELD_PATTERN = /(api_?key|apikey|access_?key|password|passwd|pwd|secret|token|authorization|(^|[_\-\s])auth($|[_\-\s])|cookie|session|phone|mobile|tel|email|id_?card|idcard|身份证|手机号|电话|邮箱|客户联系方式|联系人电话|credential|headers?)/i;

function redactSensitiveFieldsDeep(value) {
    if (Array.isArray(value)) {
        return value.map(redactSensitiveFieldsDeep);
    }

    if (!isPlainObject(value)) {
        return value;
    }

    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
        if (SENSITIVE_FIELD_PATTERN.test(key)) {
            output[key] = REDACTED_VALUE;
            continue;
        }
        output[key] = redactSensitiveFieldsDeep(nestedValue);
    }
    return output;
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
}

function inferCraftFromConstraints(constraints) {
    if (!isPlainObject(constraints)) return undefined;
    const channels = constraints.channels;
    if (Array.isArray(channels) && channels.length > 0) {
        return channels
            .filter(item => typeof item === 'string' && item.trim())
            .join(', ') || undefined;
    }
    return undefined;
}

function removeGeneratedCompanyFields(rawProject) {
    if (!isPlainObject(rawProject)) return {};
    const { companyFields: _generatedCompanyFields, ...projectFields } = rawProject;
    return projectFields;
}

function normalizeHermesProjectFields(rawProject, requestProjectCode) {
    const companyFields = redactSensitiveFieldsDeep(removeGeneratedCompanyFields(rawProject));
    const code = firstNonEmpty(companyFields.code, companyFields.projectCode, requestProjectCode);
    const name = firstNonEmpty(companyFields.name, companyFields.projectName);
    const customer = firstNonEmpty(companyFields.customer, companyFields.customerName);
    const developmentRequirement = firstNonEmpty(
        companyFields.developmentRequirement,
        companyFields.brief,
        companyFields.objective
    );
    const craft = firstNonEmpty(
        companyFields.craft,
        companyFields.process,
        inferCraftFromConstraints(companyFields.constraints)
    );
    const sizeRequirement = firstNonEmpty(companyFields.sizeRequirement, companyFields.size);
    const quantityRequirement = firstNonEmpty(
        companyFields.quantityRequirement,
        companyFields.imageCount,
        1
    );

    return {
        ...companyFields,
        code,
        name,
        customer,
        developmentRequirement,
        craft,
        sizeRequirement,
        quantityRequirement,
        companyFields
    };
}

function validateHermesP1Response(payload) {
    if (!isPlainObject(payload)) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API response must be a JSON object.',
            502
        );
    }

    const missing = [];
    if (typeof payload.status !== 'string') missing.push('status');
    if (!isPlainObject(payload.project)) missing.push('project');
    if (!isPlainObject(payload.strategy)) missing.push('strategy');
    if (!isPlainObject(payload.designTask)) missing.push('designTask');
    if (missing.length) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            `Hermes API response is missing required field(s): ${missing.join(', ')}.`,
            502
        );
    }

    if (payload.results !== undefined && !Array.isArray(payload.results)) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API response results must be an array when provided.',
            502
        );
    }

    if (Array.isArray(payload.results) && !payload.results.every(item => isPlainObject(item))) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API response results must be objects.',
            502
        );
    }
}

function normalizeStringArray(value) {
    const values = typeof value === 'string'
        ? value.split(/[,，;；\n]+/)
        : Array.isArray(value)
            ? value
            : [];
    return values
        .map(item => {
            if (typeof item === 'string') return item.trim();
            if (item === null || item === undefined) return '';
            return String(item).trim();
        })
        .filter(Boolean);
}

const URL_PATTERN = /https?:\/\/[^\s,，;；"'<>]+/gi;
const IMAGE_REFERENCE_FIELD_KEYS = new Set([
    'designimg',
    'refimg',
    'refimgurl',
    'operimg',
    'referenceimage',
    'referenceimageurl',
    'referenceimages',
    'referenceimagesurl',
    'imagereference',
    'imagereferenceurl',
    'imagereferences',
    'referencephoto',
    'referencephotourl',
    'referencephotos',
    'referencephotosurl'
]);
const LINK_REFERENCE_FIELD_KEYS = new Set([
    'designlink',
    'operlink',
    'reflink',
    'refurl',
    'referencelink',
    'referencelinks',
    'referenceurl',
    'referenceurls',
    'amazonurl',
    'amazonlink',
    'producturl',
    'productlink'
]);
const MIXED_REFERENCE_FIELD_KEYS = new Set([
    'references',
    'stylereferences',
    'assethints'
]);
const REFERENCE_FIELD_METADATA = {
    designimg: {
        label: '\u8bbe\u8ba1\u53c2\u8003\u56fe',
        role: 'design_reference'
    },
    operimg: {
        label: '\u8fd0\u8425\u53c2\u8003\u56fe',
        role: 'operation_reference'
    },
    designlink: {
        label: '\u8bbe\u8ba1\u53c2\u8003\u94fe\u63a5',
        type: 'design_reference'
    },
    operlink: {
        label: '\u8fd0\u8425\u53c2\u8003\u94fe\u63a5',
        type: 'operation_reference'
    }
};

function normalizeReferenceFieldKey(key) {
    return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanUrlCandidate(value) {
    return String(value || '')
        .trim()
        .replace(/[)\]}.,，。;；]+$/g, '');
}

function isHttpUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function sanitizeReferenceUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        for (const key of Array.from(parsed.searchParams.keys())) {
            if (SENSITIVE_FIELD_PATTERN.test(key)) {
                parsed.searchParams.set(key, REDACTED_VALUE);
            }
        }
        return parsed.toString();
    } catch {
        return value;
    }
}

function looksLikeImageUrl(value) {
    try {
        const parsed = new URL(String(value || ''));
        return /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

function extractHttpUrls(value) {
    if (typeof value === 'string') {
        const matches = value.match(URL_PATTERN) || [];
        return matches.map(cleanUrlCandidate).filter(isHttpUrl).map(sanitizeReferenceUrl);
    }

    if (Array.isArray(value)) {
        return value.flatMap(extractHttpUrls);
    }

    if (isPlainObject(value)) {
        return Object.values(value).flatMap(extractHttpUrls);
    }

    return [];
}

function collectProjectReferenceUrls(value, bucket) {
    if (Array.isArray(value)) {
        value.forEach(item => collectProjectReferenceUrls(item, bucket));
        return;
    }

    if (!isPlainObject(value)) return;

    for (const [key, nestedValue] of Object.entries(value)) {
        const normalizedKey = normalizeReferenceFieldKey(key);
        const urls = extractHttpUrls(nestedValue);
        const fieldMetadata = REFERENCE_FIELD_METADATA[normalizedKey] || {};

        if (IMAGE_REFERENCE_FIELD_KEYS.has(normalizedKey)) {
            bucket.images.push(...urls.map(url => ({
                url,
                source: 'company_system',
                label: fieldMetadata.label,
                role: fieldMetadata.role
            })));
        } else if (LINK_REFERENCE_FIELD_KEYS.has(normalizedKey)) {
            bucket.links.push(...urls.map(url => ({
                url,
                source: 'company_system',
                label: fieldMetadata.label,
                type: fieldMetadata.type
            })));
        } else if (MIXED_REFERENCE_FIELD_KEYS.has(normalizedKey)) {
            for (const url of urls) {
                if (looksLikeImageUrl(url)) bucket.images.push(url);
                else bucket.links.push(url);
            }
        }

        collectProjectReferenceUrls(nestedValue, bucket);
    }
}

function dedupeReferencesByUrl(items) {
    const seen = new Set();
    return items.filter(item => {
        if (!item?.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}

function normalizeReferenceImage(item, index) {
    const url = isPlainObject(item)
        ? firstNonEmpty(item.url, item.src, item.imageUrl, item.referenceImage, extractHttpUrls(item)[0])
        : extractHttpUrls(item)[0];
    if (!isHttpUrl(url)) return null;

    return {
        id: firstNonEmpty(isPlainObject(item) ? item.id : null, `ref_${String(index + 1).padStart(2, '0')}`),
        url,
        source: firstNonEmpty(isPlainObject(item) ? item.source : null, 'company_system'),
        label: firstNonEmpty(isPlainObject(item) ? item.label : null, '\u9879\u76ee\u53c2\u8003\u56fe'),
        role: firstNonEmpty(isPlainObject(item) ? item.role : null, 'visual_reference'),
        safeToDisplay: isPlainObject(item) && item.safeToDisplay === false ? false : true,
        importedAssetId: null
    };
}

function normalizeReferenceLink(item, index) {
    const url = isPlainObject(item)
        ? firstNonEmpty(item.url, item.href, item.link, item.referenceUrl, extractHttpUrls(item)[0])
        : extractHttpUrls(item)[0];
    if (!isHttpUrl(url)) return null;

    return {
        id: firstNonEmpty(isPlainObject(item) ? item.id : null, `link_${String(index + 1).padStart(2, '0')}`),
        url,
        source: firstNonEmpty(isPlainObject(item) ? item.source : null, 'company_system'),
        label: firstNonEmpty(isPlainObject(item) ? item.label : null, '\u53c2\u8003\u94fe\u63a5'),
        type: firstNonEmpty(isPlainObject(item) ? item.type : null, 'product_reference'),
        safeToOpen: isPlainObject(item) && item.safeToOpen === false ? false : true
    };
}

function normalizeHermesReferences(value, project) {
    const imageItems = [];
    const linkItems = [];
    const notes = [];

    if (isPlainObject(value)) {
        if (Array.isArray(value.images)) imageItems.push(...value.images);
        if (Array.isArray(value.links)) linkItems.push(...value.links);
        if (Array.isArray(value.notes)) notes.push(...value.notes);
    }

    const projectReferenceUrls = { images: [], links: [] };
    collectProjectReferenceUrls(project, projectReferenceUrls);
    imageItems.push(...projectReferenceUrls.images);
    linkItems.push(...projectReferenceUrls.links);

    const images = dedupeReferencesByUrl(imageItems
        .map(normalizeReferenceImage)
        .filter(Boolean));
    const links = dedupeReferencesByUrl(linkItems
        .map(normalizeReferenceLink)
        .filter(Boolean));

    const usedIds = new Set();
    const stableImages = images.map((item, index) => {
        const fallbackId = `ref_${String(index + 1).padStart(2, '0')}`;
        const id = usedIds.has(item.id) ? fallbackId : item.id;
        usedIds.add(id);
        return { ...item, id };
    });

    const usedLinkIds = new Set();
    const stableLinks = links.map((item, index) => {
        const fallbackId = `link_${String(index + 1).padStart(2, '0')}`;
        const id = usedLinkIds.has(item.id) ? fallbackId : item.id;
        usedLinkIds.add(id);
        return { ...item, id };
    });

    return {
        images: stableImages,
        links: stableLinks,
        notes: notes.map(item => {
            if (typeof item === 'string') return item.trim();
            if (item === null || item === undefined) return '';
            return String(item).trim();
        }).filter(Boolean)
    };
}

function normalizeHermesProjectBrief(value, project) {
    if (!isPlainObject(value)) return null;
    return {
        projectCode: firstNonEmpty(value.projectCode, project.projectCode, project.code),
        projectName: firstNonEmpty(value.projectName, project.projectName, project.name),
        customer: firstNonEmpty(value.customer, project.customer, project.customerName),
        category: firstNonEmpty(value.category, project.category),
        craft: firstNonEmpty(value.craft, project.craft),
        size: firstNonEmpty(value.size, project.sizeRequirement, project.size),
        quantity: firstNonEmpty(value.quantity, project.quantityRequirement),
        deadline: firstNonEmpty(value.deadline, project.deadline),
        designRequirement: firstNonEmpty(
            value.designRequirement,
            project.developmentRequirement,
            project.brief,
            project.objective
        ),
        constraints: Array.isArray(value.constraints) ? value.constraints : []
    };
}

function normalizeHermesDesignStrategy(value) {
    if (!isPlainObject(value)) return null;
    return {
        theme: firstNonEmpty(value.theme, ''),
        visualDirection: firstNonEmpty(value.visualDirection, ''),
        targetUser: firstNonEmpty(value.targetUser, ''),
        usageScenario: firstNonEmpty(value.usageScenario, ''),
        colorPalette: normalizeStringArray(value.colorPalette),
        composition: firstNonEmpty(value.composition, ''),
        styleKeywords: normalizeStringArray(value.styleKeywords),
        materialAndCraftNotes: normalizeStringArray(value.materialAndCraftNotes),
        avoid: normalizeStringArray(value.avoid)
    };
}

function normalizeHermesDesignTasks(value, references = { images: [], links: [] }) {
    if (!Array.isArray(value)) return [];
    const availableReferenceIds = [
        ...(Array.isArray(references.images) ? references.images.map(item => item.id) : []),
        ...(Array.isArray(references.links) ? references.links.map(item => item.id) : [])
    ].filter(Boolean);
    const hasAvailableReferences = availableReferenceIds.length > 0;

    return value
        .filter(isPlainObject)
        .map((item, index) => {
            const referenceIds = normalizeStringArray(item.referenceIds);
            const referenceUsage = firstNonEmpty(
                item.referenceUsage,
                hasAvailableReferences
                    ? 'Use the project reference materials for composition, pattern density, color direction, product proportion, and craft suitability. Do not claim external pages or images were crawled, and do not copy trademarks, logos, or protected elements.'
                    : ''
            );

            return {
                taskId: firstNonEmpty(item.taskId, `concept_${String(index + 1).padStart(2, '0')}`),
                title: firstNonEmpty(item.title, `Concept ${index + 1}`),
                targetSize: firstNonEmpty(item.targetSize, ''),
                purpose: firstNonEmpty(item.purpose, ''),
                prompt: firstNonEmpty(item.prompt, ''),
                negativePrompt: firstNonEmpty(item.negativePrompt, item.negative_prompt, ''),
                modelRecommendation: firstNonEmpty(item.modelRecommendation, 'custom-image-gpt-image-2'),
                referenceRequired: Boolean(item.referenceRequired) || hasAvailableReferences || referenceIds.length > 0,
                referenceIds: referenceIds.length > 0 ? referenceIds : availableReferenceIds,
                referenceUsage,
                notes: Array.isArray(item.notes) ? item.notes : []
            };
        });
}

function normalizeHermesGenerationReadiness(value) {
    const reason = isPlainObject(value)
        ? firstNonEmpty(
            value.reason,
            'P3-A only generates design tasks and prompts. Image generation is handled by MYML-CANVAS later.'
        )
        : 'P3-A only generates design tasks and prompts. Image generation is handled by MYML-CANVAS later.';

    return {
        readyForImageGeneration: false,
        reason
    };
}

function normalizeHermesApiPayload(payload, { projectCode, envelope }) {
    validateHermesP1Response(payload);
    const project = normalizeHermesProjectFields(payload.project, projectCode);
    const projectBrief = normalizeHermesProjectBrief(payload.projectBrief, project);
    const designStrategy = normalizeHermesDesignStrategy(payload.designStrategy);
    const references = normalizeHermesReferences(payload.references, project);
    const designTasks = normalizeHermesDesignTasks(payload.designTasks, references);
    const results = Array.isArray(payload.results) ? payload.results : [];

    const normalized = {
        status: payload.status,
        hermesRequestId: payload.hermesRequestId || envelope?.id || null,
        hermesRunId: payload.hermesRunId || payload.runId || null,
        project,
        strategy: payload.strategy,
        designTask: payload.designTask,
        results: results.map((item, index) => ({
            imageId: item.imageId || `hermes_api_mock_img_${index + 1}`,
            url: typeof item.url === 'string' && item.url.startsWith('/')
                ? item.url
                : '/workflow-sample-1.png',
            model: item.model || payload.strategy?.selectedModel || 'hermes-api-mock-image-strategy-v1',
            prompt: item.prompt || payload.designTask?.prompt || '',
        })),
    };

    if (projectBrief) normalized.projectBrief = projectBrief;
    if (designStrategy) normalized.designStrategy = designStrategy;
    if (designTasks.length > 0) normalized.designTasks = designTasks;
    if (references.images.length > 0 || references.links.length > 0 || references.notes.length > 0) {
        normalized.references = references;
    }
    if (projectBrief || designStrategy || designTasks.length > 0 || payload.generationReadiness) {
        normalized.generationReadiness = normalizeHermesGenerationReadiness(payload.generationReadiness);
    }

    return redactSensitiveFieldsDeep(normalized);
}

async function callHermesApi({ user, projectCode, message, config }) {
    if (!config.apiKey) {
        throw createHermesError(
            'HERMES_NOT_CONFIGURED',
            'Hermes API key is not configured.',
            503
        );
    }

    const url = `${config.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAt = Date.now();

    const body = {
        model: config.model,
        stream: false,
        messages: [
            {
                role: 'system',
                content: HERMES_API_SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: JSON.stringify({
                    projectCode,
                    message: message || '',
                    user: {
                        id: user?.id || null,
                        username: user?.username || null,
                    },
                    boundaries: {
                        projectFieldsRequired: true,
                        companySystemLookupRequired: true,
                        noRealImageGeneration: true,
                        noExternalImageDownload: true,
                        noExternalLinkVisit: true,
                        noAmazonCrawl: true,
                    },
                }),
            },
        ],
    };

    console.log('[HermesClient] Calling Hermes API', {
        url,
        model: config.model,
        timeoutMs: config.timeoutMs,
        projectCode,
    });

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw createHermesError(
                'HERMES_TIMEOUT',
                `Hermes API timed out after ${config.timeoutMs}ms.`,
                504
            );
        }
        throw createHermesError(
            'HERMES_API_REQUEST_FAILED',
            `Hermes API request failed: ${error?.message || error}`,
            502
        );
    } finally {
        clearTimeout(timeout);
    }

    const rawText = await response.text();
    let envelope;
    try {
        envelope = rawText ? JSON.parse(rawText) : {};
    } catch {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes API returned a non-JSON envelope.',
            502
        );
    }

    if (!response.ok) {
        const messageText =
            envelope?.error?.message ||
            envelope?.message ||
            response.statusText ||
            'Hermes API request failed.';
        throw createHermesError(
            response.status === 401 || response.status === 403
                ? 'HERMES_AUTH_ERROR'
                : 'HERMES_API_ERROR',
            `Hermes API failed: ${String(messageText).slice(0, 240)}`,
            response.status
        );
    }

    const content = envelope?.choices?.[0]?.message?.content;
    const parsedPayload = parseHermesJsonContent(content);
    const normalized = normalizeHermesApiPayload(parsedPayload, { projectCode, envelope });

    console.log('[HermesClient] Hermes API completed', {
        projectCode,
        model: config.model,
        elapsedMs: Date.now() - startedAt,
        resultCount: normalized.results.length,
    });

    return normalized;
}

export async function runHermesProjectMock({ user, projectCode, message }) {
    const requestId = `mock_req_${crypto.randomUUID()}`;
    const runId = `mock_run_${crypto.randomUUID()}`;
    const prompt = [
        `Create a production-ready textile pattern concept for project ${projectCode}.`,
        'Use the available company fields to infer a restrained but distinctive visual direction.',
        'Prioritize repeatability, craft compatibility, and brand-safe color strategy.'
    ].join(' ');

    return {
        status: 'completed',
        hermesRequestId: requestId,
        hermesRunId: runId,
        project: {
            code: projectCode,
            name: `Mock ${projectCode} Pattern Development`,
            category: 'Textile pattern',
            customer: user?.username || 'MYML internal designer',
            developmentRequirement: message || `Develop initial pattern concepts for ${projectCode}.`,
            craft: 'Digital print mock',
            sizeRequirement: 'Repeat tile, 2048 x 2048 preview',
            quantityRequirement: '1 initial direction'
        },
        strategy: {
            selectedModel: 'hermes-mock-image-strategy-v1',
            reason: 'Mock Hermes selected a fast visual exploration path for P0 integration validation.',
            imageCount: 1,
            size: '2048x2048',
            mode: 'mock-pattern-generation'
        },
        designTask: {
            task_type: 'pattern_generation',
            theme: `${projectCode} visual concept`,
            prompt,
            negative_prompt: 'low quality, blurry, off-brand typography, messy repeat seams'
        },
        results: [
            {
                imageId: `mock_img_${crypto.randomUUID()}`,
                url: getMockImageUrl(projectCode),
                model: 'hermes-mock-image-strategy-v1',
                prompt
            }
        ]
    };
}

export async function runHermesProjectClient({ user, projectCode, message, env = process.env } = {}) {
    const config = getHermesClientConfig(env);
    if (config.mode === 'api') {
        return await callHermesApi({
            user,
            projectCode,
            message,
            config,
        });
    }

    return await runHermesProjectMock({ user, projectCode, message });
}

export default {
    getHermesClientConfig,
    getHermesStartupSummary,
    runHermesProjectMock,
    runHermesProjectClient
};
