import crypto from 'crypto';

const DEFAULT_HERMES_BASE_URL = 'http://127.0.0.1:8642/v1';
const DEFAULT_HERMES_MODEL = 'hermes-agent';
const DEFAULT_HERMES_TIMEOUT_MS = 180000;
const MAX_DESIGNS_PER_GENERATION = 6;

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
- Determine expectedDesignTaskCount from project fields including projectName, designRequirement, developmentRequirement, quantityRequirement, sizeRequirement, brief, developmentKeywords, and operationKeywords.
- Treat explicit phrases such as "6\u4e2a\u56fe", "6\u5f20\u56fe", "6\u6b3e", "6 designs", "six images", "12pcs", "12\u4e2a", "\u591a\u6b3e\u5f0f", and similar count instructions as design-count intent.
- maxDesignsPerGeneration must be ${MAX_DESIGNS_PER_GENERATION}.
- If expectedDesignTaskCount <= ${MAX_DESIGNS_PER_GENERATION}, actualDesignTaskCount must equal expectedDesignTaskCount and designTasks.length must equal actualDesignTaskCount.
- If expectedDesignTaskCount > ${MAX_DESIGNS_PER_GENERATION}, actualDesignTaskCount must be ${MAX_DESIGNS_PER_GENERATION}, designTasks.length must be ${MAX_DESIGNS_PER_GENERATION}, and batchPlan must describe the split plan.
- For expectedDesignTaskCount > ${MAX_DESIGNS_PER_GENERATION}, countReason must explain that the model single-batch limit is ${MAX_DESIGNS_PER_GENERATION}, so this response only plans the first ${MAX_DESIGNS_PER_GENERATION} design directions.
- batchPlan must include totalRequired, maxPerBatch, totalBatches, currentBatch, batchLabel, remainingCount, and reason.
- If the required count is unclear, output 3 to 4 designTasks and explain in countReason that the project did not specify an exact count.
- Return expectedDesignTaskCount, actualDesignTaskCount, maxDesignsPerGeneration, countReason, and batchPlan at the top level when task count intent is known.
- Every designTask must have a clearly distinct creative direction. Do not only change the title.
- For badge, rug, set, mixed-size, multi-pcs, or multi-style projects, split tasks by product size, pattern theme, use scenario, core elements, style difference, or size.
- Every design task must include structuredPromptDescription, prompt, and negativePrompt.
- For each designTask, first create structuredPromptDescription, then derive the final English prompt and negativePrompt from it.
- structuredPromptDescription must include: Core Subject & Theme, Product Context & Usage, Art Style & Medium, Color Palette & Mood, Composition & Layout, Detailed Visual Elements, Text & Typography, Pattern / Production Constraints, Reference Usage, and Negative Constraints.
- prompt must be an English image-generation prompt for pattern design, home product pattern direction, and production-ready repeatable surface design.
- negativePrompt must avoid cluttered composition, unreadable small text, low clarity, trademarks/logos, photorealistic faces, extra background clutter, incorrect text, and elements unrelated to the product.
- generationReadiness.readyForImageGeneration must be false in P3-A.
- Do not call image generation. Do not create generated image URLs. Do not claim images have been generated.

Reference material rules:
- Extract reference images and reference links from company_project_lookup fields such as ref_img, ref_link, reference_image, reference_url, amazon_url, amazon_link, product_url, design_img, design_link, oper_img, and oper_link.
- If reference images or Amazon/product/reference links exist, put them into references.images or references.links.
- Preserve companyFields.references items when present, including rawValue, resolvedUrl, url, isHttpUrl, safeToDisplay, and safeToOpen.
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
      "structuredPromptDescription": {
        "coreSubjectAndTheme": "...",
        "productContextAndUsage": "...",
        "artStyleAndMedium": "...",
        "colorPaletteAndMood": "...",
        "compositionAndLayout": "...",
        "detailedVisualElements": {
          "mainFocus": "...",
          "backgroundAtmosphere": "...",
          "foregroundFraming": "...",
          "specificDetailsProps": "..."
        },
        "textAndTypography": "None",
        "patternProductionConstraints": "...",
        "referenceUsage": "...",
        "negativeConstraints": "..."
      },
      "prompt": "...",
      "negativePrompt": "...",
      "modelRecommendation": "custom-image-gpt-image-2",
      "referenceRequired": true,
      "referenceIds": ["ref_01", "link_01"],
      "referenceUsage": "Use the project references as visual context without claiming the links were crawled.",
      "notes": []
    }
  ],
  "expectedDesignTaskCount": 12,
  "actualDesignTaskCount": 6,
  "maxDesignsPerGeneration": 6,
  "countReason": "The project requests more than 6 designs. The single-batch limit is 6, so this response prepares the first 6 design directions only.",
  "batchPlan": {
    "totalRequired": 12,
    "maxPerBatch": 6,
    "totalBatches": 2,
    "currentBatch": 1,
    "batchLabel": "Batch 1 / 2",
    "remainingCount": 6,
    "reason": "The project requests more than 6 designs. This batch prepares the first 6 design directions only."
  },
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
const SENSITIVE_FIELD_PATTERN = /(api_?key|apikey|access_?key|password|passwd|pwd|secret|token|authorization|(^|[_\-\s])auth($|[_\-\s])|cookie|session|phone|mobile|tel|email|id_?card|idcard|\u8eab\u4efd\u8bc1|\u624b\u673a\u53f7|\u7535\u8bdd|\u90ae\u7bb1|\u5ba2\u6237\u8054\u7cfb\u65b9\u5f0f|\u8054\u7cfb\u4eba\u7535\u8bdd|credential|headers?)/i;

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
    const { companyFields: generatedCompanyFields, ...projectFields } = rawProject;
    if (!isPlainObject(generatedCompanyFields)) return projectFields;
    const { companyFields: _nestedGeneratedCompanyFields, ...nestedCompanyFields } = generatedCompanyFields;
    return {
        ...nestedCompanyFields,
        ...projectFields
    };
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
        .replace(/[)\]}.,\uFF0C\u3002\uFF1B]+$/g, '');
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

function getFirstHttpReferenceUrl(value) {
    return extractHttpUrls(value)[0];
}

function extractReferenceRawValues(value) {
    if (typeof value === 'string') {
        return value
            .split(/[\n,;\uFF0C\uFF1B]+/g)
            .map(item => item.trim())
            .filter(Boolean);
    }

    if (Array.isArray(value)) {
        return value.flatMap(extractReferenceRawValues);
    }

    if (isPlainObject(value)) {
        const directValue = firstNonEmpty(
            value.rawValue,
            value.resolvedUrl,
            value.url,
            value.src,
            value.href,
            value.link,
            value.path,
            value.value
        );
        if (directValue) return extractReferenceRawValues(directValue);
    }

    return [];
}

function collectStructuredReferenceItems(value, bucket) {
    if (!isPlainObject(value)) return;
    if (Array.isArray(value.images)) bucket.images.push(...value.images);
    if (Array.isArray(value.links)) bucket.links.push(...value.links);
    if (Array.isArray(value.notes)) bucket.notes.push(...value.notes);
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
            if (urls.length > 0) {
                bucket.images.push(...urls.map(url => ({
                    url,
                    resolvedUrl: url,
                    isHttpUrl: true,
                    source: 'company_system',
                    label: fieldMetadata.label,
                    role: fieldMetadata.role,
                    field: key
                })));
            } else {
                bucket.images.push(...extractReferenceRawValues(nestedValue).map(rawValue => ({
                    rawValue,
                    isHttpUrl: false,
                    safeToDisplay: false,
                    safeToOpen: false,
                    source: 'company_system',
                    label: fieldMetadata.label,
                    role: fieldMetadata.role,
                    field: key,
                    message: 'Company image field was returned, but it is not a directly accessible http/https URL.'
                })));
            }
        } else if (LINK_REFERENCE_FIELD_KEYS.has(normalizedKey)) {
            if (urls.length > 0) {
                bucket.links.push(...urls.map(url => ({
                    url,
                    resolvedUrl: url,
                    isHttpUrl: true,
                    source: 'company_system',
                    label: fieldMetadata.label,
                    type: fieldMetadata.type,
                    field: key
                })));
            } else {
                bucket.notes.push(...extractReferenceRawValues(nestedValue).map(rawValue => ({
                    rawValue,
                    source: 'company_system',
                    label: fieldMetadata.label,
                    type: fieldMetadata.type,
                    field: key,
                    message: 'Company reference link field was returned, but it is not a directly accessible http/https URL.'
                })));
            }
        } else if (MIXED_REFERENCE_FIELD_KEYS.has(normalizedKey)) {
            collectStructuredReferenceItems(nestedValue, bucket);
            for (const url of urls) {
                if (looksLikeImageUrl(url)) bucket.images.push({
                    url,
                    resolvedUrl: url,
                    isHttpUrl: true,
                    source: 'company_system',
                    field: key
                });
                else bucket.links.push({
                    url,
                    resolvedUrl: url,
                    isHttpUrl: true,
                    source: 'company_system',
                    field: key
                });
            }
        }

        collectProjectReferenceUrls(nestedValue, bucket);
    }
}

function getReferenceIdentity(item) {
    const field = isPlainObject(item) ? firstNonEmpty(item.field, item.label, item.role, item.type, '') : '';
    const rawValue = isPlainObject(item) ? firstNonEmpty(item.rawValue, '') : '';
    if (field && rawValue) return `${String(field).trim()}|raw:${String(rawValue).trim()}`;
    const value = isPlainObject(item)
        ? firstNonEmpty(item.url, item.resolvedUrl, item.rawValue, item.src, item.href, item.link, '')
        : firstNonEmpty(item, '');
    return `${String(field).trim()}|${String(value).trim()}`;
}

function getReferenceCompletenessScore(item) {
    if (!isPlainObject(item)) return 0;
    const hasUrl = Boolean(firstNonEmpty(item.url, item.resolvedUrl));
    const role = String(item.role || '').toLowerCase();
    const field = String(item.field || '').toLowerCase();
    const label = String(item.label || '');
    return [
        hasUrl ? 1000 : 0,
        item.safeToDisplay === true ? 500 : 0,
        item.isHttpUrl === true ? 250 : 0,
        item.safeToOpen === true ? 125 : 0,
        role === 'design_reference' || role === 'operation_reference' ? 80 : 0,
        role === 'visual_reference' ? -10 : 0,
        field === 'design_img' || field === 'oper_img' ? 60 : 0,
        field === 'references' ? -10 : 0,
        label === '\u8bbe\u8ba1\u53c2\u8003\u56fe' || label === '\u8fd0\u8425\u53c2\u8003\u56fe' ? 20 : 0,
        item.rawValue ? 5 : 0,
        item.label ? 2 : 0,
        item.role || item.type ? 2 : 0,
        item.id ? 1 : 0
    ].reduce((sum, value) => sum + value, 0);
}

function normalizeReferenceIdentityPart(value) {
    return String(value || '').trim();
}

function getUrlTempPathIdentity(value) {
    try {
        const parsed = new URL(String(value || ''));
        const match = parsed.pathname.match(/\/temp\/.+$/i);
        return match ? normalizeReferenceIdentityPart(match[0].replace(/^\/+/, '')) : '';
    } catch {
        const rawValue = normalizeReferenceIdentityPart(value);
        const match = rawValue.match(/(?:^|[\\/])temp[\\/].+$/i);
        return match ? normalizeReferenceIdentityPart(match[0].replace(/^[\\/]+/, '').replace(/\\/g, '/')) : '';
    }
}

function getImageReferenceIdentities(item) {
    if (!isPlainObject(item)) return [];
    const field = normalizeReferenceIdentityPart(item.field);
    const values = [
        normalizeReferenceIdentityPart(item.url),
        normalizeReferenceIdentityPart(item.resolvedUrl),
        normalizeReferenceIdentityPart(item.rawValue)
    ].filter(Boolean);
    const tempValues = [
        getUrlTempPathIdentity(item.url),
        getUrlTempPathIdentity(item.resolvedUrl),
        getUrlTempPathIdentity(item.rawValue)
    ].filter(Boolean);
    const identities = new Set();

    for (const value of values) {
        identities.add(`value:${value}`);
        if (field) identities.add(`field:${field}|value:${value}`);
    }
    for (const value of tempValues) {
        identities.add(`temp:${value}`);
        if (field) identities.add(`field:${field}|temp:${value}`);
    }

    return Array.from(identities);
}

function mergeImageReferenceItems(current, next) {
    const currentScore = getReferenceCompletenessScore(current);
    const nextScore = getReferenceCompletenessScore(next);
    const winner = nextScore > currentScore ? next : current;
    const fallback = winner === next ? current : next;
    const merged = {
        ...fallback,
        ...winner,
        rawValue: firstNonEmpty(winner.rawValue, fallback.rawValue),
        url: firstNonEmpty(winner.url, fallback.url),
        resolvedUrl: firstNonEmpty(winner.resolvedUrl, fallback.resolvedUrl),
        safeToDisplay: winner.safeToDisplay === true || fallback.safeToDisplay === true,
        safeToOpen: winner.safeToOpen === true || fallback.safeToOpen === true,
        isHttpUrl: winner.isHttpUrl === true || fallback.isHttpUrl === true
    };

    const fallbackRole = String(fallback.role || '').toLowerCase();
    const mergedRole = String(merged.role || '').toLowerCase();
    if ((fallbackRole === 'design_reference' || fallbackRole === 'operation_reference') && mergedRole === 'visual_reference') {
        merged.role = fallback.role;
    }

    const fallbackField = String(fallback.field || '').toLowerCase();
    const mergedField = String(merged.field || '').toLowerCase();
    if ((fallbackField === 'design_img' || fallbackField === 'oper_img') && mergedField === 'references') {
        merged.field = fallback.field;
    }

    const fallbackLabel = String(fallback.label || '');
    if ((fallbackLabel === '\u8bbe\u8ba1\u53c2\u8003\u56fe' || fallbackLabel === '\u8fd0\u8425\u53c2\u8003\u56fe') && merged.label === '\u9879\u76ee\u53c2\u8003\u56fe') {
        merged.label = fallback.label;
    }

    return merged;
}

function dedupeReferences(items) {
    const byIdentity = new Map();
    for (const item of items) {
        const key = getReferenceIdentity(item);
        if (!key) continue;
        const current = byIdentity.get(key);
        if (!current || getReferenceCompletenessScore(item) > getReferenceCompletenessScore(current)) {
            byIdentity.set(key, item);
        }
    }
    return Array.from(byIdentity.values());
}

function dedupeImageReferences(items) {
    const byIdentity = new Map();
    const output = [];
    for (const item of items) {
        const identities = getImageReferenceIdentities(item);
        if (identities.length === 0) continue;
        const existingIndex = identities
            .map(identity => byIdentity.get(identity))
            .find(index => index !== undefined);

        if (existingIndex === undefined) {
            const nextIndex = output.length;
            output.push(item);
            identities.forEach(identity => byIdentity.set(identity, nextIndex));
            continue;
        }

        const merged = mergeImageReferenceItems(output[existingIndex], item);
        output[existingIndex] = merged;
        getImageReferenceIdentities(merged)
            .concat(identities)
            .forEach(identity => byIdentity.set(identity, existingIndex));
    }
    return output;
}

function normalizeReferenceImage(item, index) {
    const candidate = getFirstHttpReferenceUrl(isPlainObject(item)
        ? [
            item.resolvedUrl,
            item.url,
            item.src,
            item.imageUrl,
            item.referenceImage,
            item.rawValue
        ]
        : item);
    const rawValue = isPlainObject(item)
        ? firstNonEmpty(item.rawValue, item.path, item.value, item.url, item.resolvedUrl, candidate)
        : firstNonEmpty(item, candidate);
    const resolvedUrl = isHttpUrl(candidate) ? sanitizeReferenceUrl(candidate) : undefined;

    if (!resolvedUrl && !rawValue) return null;

    return {
        id: firstNonEmpty(isPlainObject(item) ? item.id : null, `ref_${String(index + 1).padStart(2, '0')}`),
        ...(resolvedUrl ? { url: resolvedUrl, resolvedUrl } : {}),
        ...(rawValue ? { rawValue } : {}),
        isHttpUrl: Boolean(resolvedUrl),
        source: firstNonEmpty(isPlainObject(item) ? item.source : null, 'company_system'),
        label: firstNonEmpty(isPlainObject(item) ? item.label : null, '\u9879\u76ee\u53c2\u8003\u56fe'),
        role: firstNonEmpty(isPlainObject(item) ? item.role : null, 'visual_reference'),
        safeToDisplay: Boolean(resolvedUrl) && !(isPlainObject(item) && item.safeToDisplay === false),
        safeToOpen: Boolean(resolvedUrl) && !(isPlainObject(item) && item.safeToOpen === false),
        ...(isPlainObject(item) && item.field ? { field: item.field } : {}),
        ...(isPlainObject(item) && item.message ? { message: item.message } : {}),
        importedAssetId: null
    };
}

function normalizeReferenceLink(item, index) {
    const candidate = getFirstHttpReferenceUrl(isPlainObject(item)
        ? [
            item.resolvedUrl,
            item.url,
            item.href,
            item.link,
            item.referenceUrl,
            item.rawValue
        ]
        : item);
    const rawValue = isPlainObject(item)
        ? firstNonEmpty(item.rawValue, item.path, item.value, item.url, item.resolvedUrl, candidate)
        : firstNonEmpty(item, candidate);
    const resolvedUrl = isHttpUrl(candidate) ? sanitizeReferenceUrl(candidate) : undefined;

    if (!resolvedUrl && !rawValue) return null;

    return {
        id: firstNonEmpty(isPlainObject(item) ? item.id : null, `link_${String(index + 1).padStart(2, '0')}`),
        ...(resolvedUrl ? { url: resolvedUrl, resolvedUrl } : {}),
        ...(rawValue ? { rawValue } : {}),
        isHttpUrl: Boolean(resolvedUrl),
        source: firstNonEmpty(isPlainObject(item) ? item.source : null, 'company_system'),
        label: firstNonEmpty(isPlainObject(item) ? item.label : null, '\u53c2\u8003\u94fe\u63a5'),
        type: firstNonEmpty(isPlainObject(item) ? item.type : null, 'product_reference'),
        safeToOpen: Boolean(resolvedUrl) && !(isPlainObject(item) && item.safeToOpen === false),
        ...(isPlainObject(item) && item.field ? { field: item.field } : {}),
        ...(isPlainObject(item) && item.message ? { message: item.message } : {})
    };
}

function normalizeReferenceNote(item) {
    if (typeof item === 'string') return item.trim();
    if (item === null || item === undefined) return '';
    if (isPlainObject(item)) return item;
    return String(item).trim();
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

    const projectReferenceUrls = { images: [], links: [], notes: [] };
    collectProjectReferenceUrls(project, projectReferenceUrls);
    imageItems.push(...projectReferenceUrls.images);
    linkItems.push(...projectReferenceUrls.links);
    notes.push(...projectReferenceUrls.notes);

    const images = dedupeImageReferences(imageItems
        .map(normalizeReferenceImage)
        .filter(Boolean));
    const links = dedupeReferences(linkItems
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
        notes: dedupeReferences(notes.map(normalizeReferenceNote).filter(Boolean))
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

function normalizeHermesStructuredPromptDescription(value) {
    if (!isPlainObject(value)) return null;
    const details = isPlainObject(value.detailedVisualElements) ? value.detailedVisualElements : {};

    return {
        coreSubjectAndTheme: firstNonEmpty(value.coreSubjectAndTheme, ''),
        productContextAndUsage: firstNonEmpty(value.productContextAndUsage, ''),
        artStyleAndMedium: firstNonEmpty(value.artStyleAndMedium, ''),
        colorPaletteAndMood: firstNonEmpty(value.colorPaletteAndMood, ''),
        compositionAndLayout: firstNonEmpty(value.compositionAndLayout, ''),
        detailedVisualElements: {
            mainFocus: firstNonEmpty(details.mainFocus, ''),
            backgroundAtmosphere: firstNonEmpty(details.backgroundAtmosphere, ''),
            foregroundFraming: firstNonEmpty(details.foregroundFraming, ''),
            specificDetailsProps: firstNonEmpty(details.specificDetailsProps, '')
        },
        textAndTypography: firstNonEmpty(value.textAndTypography, 'None'),
        patternProductionConstraints: firstNonEmpty(value.patternProductionConstraints, ''),
        referenceUsage: firstNonEmpty(value.referenceUsage, ''),
        negativeConstraints: firstNonEmpty(value.negativeConstraints, '')
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
            const structuredPromptDescription = normalizeHermesStructuredPromptDescription(item.structuredPromptDescription);
            const referenceUsage = firstNonEmpty(
                item.referenceUsage,
                structuredPromptDescription?.referenceUsage,
                hasAvailableReferences
                    ? 'Use the project reference materials for composition, pattern density, color direction, product proportion, and craft suitability. Do not claim external pages or images were crawled, and do not copy trademarks, logos, or protected elements.'
                    : ''
            );

            return {
                taskId: firstNonEmpty(item.taskId, `concept_${String(index + 1).padStart(2, '0')}`),
                title: firstNonEmpty(item.title, `Concept ${index + 1}`),
                targetSize: firstNonEmpty(item.targetSize, ''),
                purpose: firstNonEmpty(item.purpose, ''),
                ...(structuredPromptDescription ? { structuredPromptDescription } : {}),
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

function normalizeOptionalPositiveInteger(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalNonNegativeInteger(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeHermesBatchPlan(value) {
    if (!isPlainObject(value)) return null;
    const totalRequired = normalizeOptionalPositiveInteger(value.totalRequired);
    const maxPerBatch = normalizeOptionalPositiveInteger(value.maxPerBatch) || MAX_DESIGNS_PER_GENERATION;
    const totalBatches = normalizeOptionalPositiveInteger(value.totalBatches);
    const currentBatch = normalizeOptionalPositiveInteger(value.currentBatch);
    const remainingCount = normalizeOptionalNonNegativeInteger(value.remainingCount);
    const batchLabel = firstNonEmpty(value.batchLabel, '');
    const reason = firstNonEmpty(value.reason, '');

    return {
        ...(totalRequired ? { totalRequired } : {}),
        maxPerBatch,
        ...(totalBatches ? { totalBatches } : {}),
        ...(currentBatch ? { currentBatch } : {}),
        ...(batchLabel ? { batchLabel } : {}),
        ...(remainingCount !== null ? { remainingCount } : {}),
        ...(reason ? { reason } : {})
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
    const expectedDesignTaskCount = normalizeOptionalPositiveInteger(
        firstNonEmpty(payload.expectedDesignTaskCount, payload.generationReadiness?.expectedDesignTaskCount)
    );
    const actualDesignTaskCount = designTasks.length;
    const maxDesignsPerGeneration = normalizeOptionalPositiveInteger(
        firstNonEmpty(payload.maxDesignsPerGeneration, payload.generationReadiness?.maxDesignsPerGeneration)
    ) || MAX_DESIGNS_PER_GENERATION;
    const countReason = firstNonEmpty(payload.countReason, payload.generationReadiness?.countReason);
    const batchPlan = normalizeHermesBatchPlan(payload.batchPlan || payload.generationReadiness?.batchPlan);

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
    if (expectedDesignTaskCount) normalized.expectedDesignTaskCount = expectedDesignTaskCount;
    normalized.actualDesignTaskCount = actualDesignTaskCount;
    normalized.maxDesignsPerGeneration = maxDesignsPerGeneration;
    if (countReason) normalized.countReason = countReason;
    if (batchPlan) normalized.batchPlan = batchPlan;
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
