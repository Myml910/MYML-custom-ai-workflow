import crypto from 'crypto';

const DEFAULT_HERMES_BASE_URL = 'http://127.0.0.1:8642/v1';
const DEFAULT_HERMES_MODEL = 'hermes-agent';
const DEFAULT_HERMES_TIMEOUT_MS = 180000;
const MAX_DESIGNS_PER_GENERATION = 6;
export const HERMES_RESPONSE_MODE_FULL = 'full';
export const HERMES_RESPONSE_MODE_LIGHTWEIGHT = 'lightweight_decomposition';

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

Complex multi-product bundle guard:
- Detect multi-product bundle projects before creating designTasks.
- Set multiProductBundle=true when projectName, brief, designRequirement, developmentRequirement, developmentKeywords, or operationKeywords include signals such as "\u5957\u88c5", "gift set", "bundle", "set", multiple "1pc" items, multiple plus-separated products, multiple product names, multiple sizes, or multiple crafts.
- For projects like "1pc\u6c7d\u8f66\u676f + 1pc\u5316\u5986\u5305 + 1pc\u889c\u5b50 + 1pc\u624b\u4e32 + 1pc\u94a5\u5319\u6263", first output productTasks before designTasks.
- productTasks must be a concise array. Each item must include product, size, referenceHint, and designFocus. Use the company's product wording where possible.
- If multiProductBundle=true, derive designTasks from productTasks first. Generate one designTask for each main child product, plus one optional overall visual system / unified element library task when it helps the set stay coherent.
- For YXF-style multi-product gift sets, the preferred task order is each product first, then the overall visual system task. Example: \u6c7d\u8f66\u676f, \u5316\u5986\u5305, \u889c\u5b50, \u624b\u4e32, \u94a5\u5319\u6263, \u6574\u4f53\u5957\u88c5\u89c6\u89c9\u7cfb\u7edf.
- expectedDesignTaskCount = min(productTasks.length + optional overall visual system task, ${MAX_DESIGNS_PER_GENERATION}) for multi-product bundles, unless the project explicitly requires fewer current-batch outputs.
- If productTasks.length is greater than ${MAX_DESIGNS_PER_GENERATION}, return only the first ${MAX_DESIGNS_PER_GENERATION} current-batch designTasks and include batchPlan.
- The overall visual system task must still be an image-generatable visual system prompt, not only a text strategy.

Complex bundle compact output mode:
- If multiProductBundle=true, use compact output mode.
- Compact output mode must prioritize productTasks plus image-generation-ready designTasks over long reasoning or full structured descriptions.
- If multiProductBundle=true, keep projectBrief concise.
- If multiProductBundle=true, keep designStrategy concise.
- If multiProductBundle=true, references.notes must contain at most 2 items.
- If multiProductBundle=true, do not output the full 10-section structuredPromptDescription for every designTask.
- If multiProductBundle=true, structuredPromptDescription may be omitted.
- If multiProductBundle=true and structuredPromptDescription is included, it must be minimal and may contain only coreSubjectAndTheme, productContextAndUsage, colorPaletteAndMood, and patternProductionConstraints. Each field must be at most 1 sentence.
- If multiProductBundle=true, each designTask.notes array must contain at most 2 items.
- If multiProductBundle=true, each designTask may only include taskId, title, product, targetSize, purpose, prompt, negativePrompt, modelRecommendation, alternativeModelRecommendation, modelReason, referenceRequired, referenceIds, referenceUsage, and notes.
- Do not repeat full reference URLs inside every designTask. Use referenceIds, reference labels, or lightweight phrases such as "third reference" / "fifth reference".
- Do not output long explanations, marketing copy, or repeated raw companyFields descriptions inside designTasks.

- For non-bundle projects, every designTask should include structuredPromptDescription, prompt, and negativePrompt.
- For non-bundle projects, create structuredPromptDescription first, then derive the final English prompt and negativePrompt from it.
- For non-bundle projects, structuredPromptDescription should include: Core Subject & Theme, Product Context & Usage, Art Style & Medium, Color Palette & Mood, Composition & Layout, Detailed Visual Elements, Text & Typography, Pattern / Production Constraints, Reference Usage, and Negative Constraints.
- For multiProductBundle compact output, prompt and negativePrompt are required, but structuredPromptDescription is optional and should stay minimal if present.
- prompt must be an English image-generation prompt for pattern design, home product pattern direction, and production-ready repeatable surface design.
- negativePrompt must avoid cluttered composition, unreadable small text, low clarity, trademarks/logos, photorealistic faces, extra background clutter, incorrect text, and elements unrelated to the product.
- Every designTask must include modelRecommendation, alternativeModelRecommendation, and modelReason.
- Prefer modelRecommendation "custom-image-t8-gpt-image-2" (T8 GPT Image 2) for production-ready patterns, clear structure, small-size printing, readable text, badge designs, explicit typography, and high composition stability.
- Prefer modelRecommendation "custom-image-t8-nano-banana-3-1-flash" (T8 Nano Banana 3.1 Flash) for fast multi-style exploration, decorative-rich pattern variants, atmosphere exploration, and visual style combinations.
- If a task contains explicit text, badge layout, small-size printing, readability requirements, or stable composition requirements, choose "custom-image-t8-gpt-image-2" and set alternativeModelRecommendation to "custom-image-t8-nano-banana-3-1-flash".
- If a task is mostly decorative exploration, style variation, ornament density, or element combination, choose "custom-image-t8-nano-banana-3-1-flash" and set alternativeModelRecommendation to "custom-image-t8-gpt-image-2".
- modelReason must briefly explain the recommendation using the task's production constraints and visual goal.
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
- For multi-product bundles, referenceUsage should use referenceIds, reference labels, reference index hints, or product-specific hints only. Do not repeat every full URL in every designTask.
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
  "multiProductBundle": false,
  "productTasks": [
    {
      "product": "...",
      "size": "...",
      "referenceHint": "...",
      "designFocus": "..."
    }
  ],
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
      "product": "...",
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
      "modelRecommendation": "custom-image-t8-gpt-image-2",
      "alternativeModelRecommendation": "custom-image-t8-nano-banana-3-1-flash",
      "modelReason": "Use T8 GPT Image 2 because this task needs readable badge text, stable composition, and small-size print clarity.",
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

const HERMES_LIGHTWEIGHT_DECOMPOSITION_SYSTEM_PROMPT = `You are the Hermes execution gateway for MYML Canvas.

You must load and follow the company-system project lookup skill:
Load skill_view(name="company-system:project-lookup")

Execution rules:
1. Extract projectCode from the user payload.
2. You must call company_project_lookup with projectCode.
3. The final output must be exactly one JSON object. Do not use markdown. Do not explain.
4. Do not query any other external system.
5. Do not generate images.
6. Do not download reference images. Do not visit reference links. Do not crawl Amazon.
7. Do not include API keys, headers, authorization values, raw upstream debug payloads, or internal secrets.

This is P5-E-3A lightweight product decomposition mode.
Only return a lightweight project decomposition. Do not generate full prompts yet.

Required output:
- status must be "completed".
- mode must be "lightweight_decomposition".
- lightweightMode must be true.
- Include projectCode and projectName.
- Include a concise project object with enough project fields for MYML display. Do not duplicate raw companyFields unless needed for references.
- Include projectBrief with summary, category, craft, sizeRequirement, and quantityRequirement.
- Detect multiProductBundle from projectName, brief, designRequirement, developmentRequirement, developmentKeywords, and operationKeywords.
- Set multiProductBundle=true when the project contains signals such as "\u5957\u88c5", "gift set", "bundle", "set", multiple "1pc" items, plus-separated products, multiple product names, multiple sizes, or multiple crafts.
- For multi-product bundles, output productTasks first. Each productTask must include productTaskId, product, size, referenceHint, designFocus, referenceIds, and priority.
- For YXF-style gift sets, split by child products such as \u6c7d\u8f66\u676f, \u5316\u5986\u5305, \u889c\u5b50, \u624b\u4e32, \u94a5\u5319\u6263.
- Include references.images and references.links extracted from company fields such as design_img, oper_img, design_link, oper_link, ref_img, ref_link, reference_image, reference_url, amazon_url, amazon_link, and product_url.
- Preserve reference fields such as rawValue, resolvedUrl, url, isHttpUrl, safeToDisplay, and safeToOpen when provided by the company-system tool.
- Include expectedDesignTaskCount based on project demand.
- Include actualDesignTaskCount as 0.
- Include maxDesignsPerGeneration as ${MAX_DESIGNS_PER_GENERATION}.
- Include batchPlan when useful.
- Include generationReadiness.readyForImageGeneration=false with reason "Lightweight decomposition only. Prompt generation is handled in Stage 2."
- Include fallbackReason "complex_multi_product_bundle_lightweight_mode" for complex bundle projects.

Do not output:
- designTasks
- prompt
- negativePrompt
- structuredPromptDescription
- long designStrategy
- generated image URLs
- marketing copy
- reasoning text

Return this JSON shape:
{
  "status": "completed",
  "mode": "lightweight_decomposition",
  "lightweightMode": true,
  "projectCode": "YXF...",
  "projectName": "...",
  "project": {
    "projectCode": "YXF...",
    "projectName": "...",
    "code": "YXF...",
    "name": "...",
    "category": "...",
    "craft": "...",
    "sizeRequirement": "...",
    "quantityRequirement": "...",
    "developmentRequirement": "..."
  },
  "projectBrief": {
    "summary": "...",
    "category": "...",
    "craft": "...",
    "sizeRequirement": "...",
    "quantityRequirement": "..."
  },
  "multiProductBundle": true,
  "productTasks": [
    {
      "productTaskId": "product_01",
      "product": "\u6c7d\u8f66\u676f",
      "size": "276.5mm x 154.7mm",
      "referenceHint": "\u53c2\u8003\u6a21\u677f",
      "designFocus": "\u676f\u8eab\u56fe\u6848\u4e0e\u7c89\u7d2b K-pop \u4e3b\u9898\u7edf\u4e00",
      "referenceIds": ["ref_01"],
      "priority": 1
    }
  ],
  "references": {
    "images": [],
    "links": [],
    "notes": []
  },
  "expectedDesignTaskCount": 6,
  "actualDesignTaskCount": 0,
  "maxDesignsPerGeneration": 6,
  "batchPlan": {
    "totalRequired": 6,
    "maxPerBatch": 6,
    "totalBatches": 1,
    "currentBatch": 1,
    "batchLabel": "Batch 1 / 1",
    "remainingCount": 0,
    "reason": "Lightweight decomposition only. Stage 2 will generate prompts per product task."
  },
  "generationReadiness": {
    "readyForImageGeneration": false,
    "reason": "Lightweight decomposition only. Prompt generation is handled in Stage 2."
  },
  "fallbackReason": "complex_multi_product_bundle_lightweight_mode"
}`;

const HERMES_PRODUCT_TASK_PROMPT_SYSTEM_PROMPT = `You are Hermes Stage 2 prompt generation for MYML Canvas.

You receive one productTask from a previously completed lightweight decomposition.
Return exactly one short JSON object. Do not wrap the response in markdown fences. Do not explain.

Rules:
1. Process only the provided productTask.
2. Do not call image generation.
3. Do not download reference images.
4. Do not visit reference links or crawl Amazon.
5. Do not include API keys, headers, authorization values, raw upstream debug payloads, or internal secrets.
6. Do not repeat full reference URLs. Use referenceIds, labels, productTask.referenceHint, and concise referenceUsage only.
7. Do not claim external pages or images were read beyond the provided company fields.
8. Do not copy trademarks, logos, celebrity likenesses, or protected elements.
9. Keep JSON short and stable.
10. designTask.taskId must be derived from productTask.productTaskId:
    - product_01 -> concept_01
    - product_02 -> concept_02
    - product_03 -> concept_03
    - product_04 -> concept_04
    - product_05 -> concept_05
    - product_06 -> concept_06
    Do not output concept_01 for every productTask. If productTaskId cannot be parsed, use the provided expectedDesignTaskId.

The designTask prompt must be:
- English.
- Directly usable by an image generation model.
- Focused on pattern design / home product surface design / production-ready ornament.
- Specific to the productTask product and size.
- Consistent with the full product set style.
- structuredPromptDescription is required. Keep each field concise, but do not omit sections.
- prompt is the short final English prompt.
- generationPrompt is the full sectioned Markdown prompt package that MYML will send to the image model.
- generationPrompt must include "## Pattern Design Prompt Description", all ten sections, "## Final Image Generation Prompt", and "## Negative Prompt".

Model recommendation rules:
- Use "custom-image-t8-gpt-image-2" for clear structure, badge/typography, readable text, small-size printing, and high composition stability.
- Use "custom-image-t8-nano-banana-3-1-flash" for decorative exploration, rich elements, fast style variants, K-pop inspired motifs, and ornament composition.
- Always include alternativeModelRecommendation and a short modelReason.

Required response:
{
  "status": "completed",
  "productTaskId": "product_01",
  "designTask": {
    "taskId": "concept_01",
    "productTaskId": "product_01",
    "title": "...",
    "product": "...",
    "targetSize": "...",
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
    "generationPrompt": "## Pattern Design Prompt Description\\n\\n**1. Core Subject & Theme (\u6838\u5fc3\u4e3b\u4f53\u4e0e\u4e3b\u9898):**\\n...\\n\\n## Final Image Generation Prompt\\n...\\n\\n## Negative Prompt\\n...",
    "negativePrompt": "...",
    "modelRecommendation": "custom-image-t8-nano-banana-3-1-flash",
    "alternativeModelRecommendation": "custom-image-t8-gpt-image-2",
    "modelReason": "...",
    "referenceRequired": true,
    "referenceIds": ["ref_01"],
    "referenceUsage": "...",
    "notes": []
  }
}`;

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

function normalizeHermesResponseMode(value) {
    const rawMode = cleanString(value);
    if (!rawMode) return HERMES_RESPONSE_MODE_FULL;
    const mode = rawMode.toLowerCase();
    return mode === HERMES_RESPONSE_MODE_LIGHTWEIGHT
        ? HERMES_RESPONSE_MODE_LIGHTWEIGHT
        : HERMES_RESPONSE_MODE_FULL;
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

function validateHermesP1Response(payload, { lightweightMode = false } = {}) {
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
    if (!lightweightMode) {
        if (!isPlainObject(payload.strategy)) missing.push('strategy');
        if (!isPlainObject(payload.designTask)) missing.push('designTask');
    }
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
        summary: firstNonEmpty(value.summary, project.summary, project.developmentRequirement, project.brief),
        projectCode: firstNonEmpty(value.projectCode, project.projectCode, project.code),
        projectName: firstNonEmpty(value.projectName, project.projectName, project.name),
        customer: firstNonEmpty(value.customer, project.customer, project.customerName),
        category: firstNonEmpty(value.category, project.category),
        craft: firstNonEmpty(value.craft, project.craft),
        sizeRequirement: firstNonEmpty(value.sizeRequirement, value.size, project.sizeRequirement, project.size),
        quantityRequirement: firstNonEmpty(value.quantityRequirement, value.quantity, project.quantityRequirement),
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

function normalizeHermesProductTasks(value) {
    if (!Array.isArray(value)) return [];
    return value
        .filter(isPlainObject)
        .map((item, index) => {
            const productTaskId = firstNonEmpty(
                item.productTaskId,
                item.taskId,
                item.id,
                `product_${String(index + 1).padStart(2, '0')}`
            );
            const priority = normalizeOptionalPositiveInteger(item.priority) || index + 1;
            return {
                productTaskId,
                product: firstNonEmpty(item.product, item.productName, item.name, `Product ${index + 1}`),
                size: firstNonEmpty(item.size, item.targetSize, item.sizeRequirement, ''),
                referenceHint: firstNonEmpty(item.referenceHint, item.reference, item.referenceUsage, ''),
                designFocus: firstNonEmpty(item.designFocus, item.focus, item.purpose, ''),
                referenceIds: normalizeStringArray(item.referenceIds),
                priority
            };
        })
        .filter(item => item.product || item.size || item.referenceHint || item.designFocus || item.referenceIds.length > 0);
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

function buildStructuredPromptPackage({ structuredPromptDescription, prompt, negativePrompt }) {
    if (!isPlainObject(structuredPromptDescription)) return firstNonEmpty(prompt, '');
    const details = isPlainObject(structuredPromptDescription.detailedVisualElements)
        ? structuredPromptDescription.detailedVisualElements
        : {};
    const lines = [
        '## Pattern Design Prompt Description',
        '',
        '**1. Core Subject & Theme (\u6838\u5fc3\u4e3b\u4f53\u4e0e\u4e3b\u9898):**',
        firstNonEmpty(structuredPromptDescription.coreSubjectAndTheme, ''),
        '',
        '**2. Product Context & Usage (\u4ea7\u54c1\u8bed\u5883\u4e0e\u7528\u9014):**',
        firstNonEmpty(structuredPromptDescription.productContextAndUsage, ''),
        '',
        '**3. Art Style & Medium (\u827a\u672f\u98ce\u683c\u4e0e\u5a92\u4ecb):**',
        firstNonEmpty(structuredPromptDescription.artStyleAndMedium, ''),
        '',
        '**4. Color Palette & Mood (\u914d\u8272\u4e0e\u6c1b\u56f4):**',
        firstNonEmpty(structuredPromptDescription.colorPaletteAndMood, ''),
        '',
        '**5. Composition & Layout (\u6784\u56fe\u4e0e\u5e03\u5c40):**',
        firstNonEmpty(structuredPromptDescription.compositionAndLayout, ''),
        '',
        '**6. Detailed Visual Elements (\u5206\u5c42\u7ec6\u8282\u63cf\u8ff0):**',
        `* **Main Focus (Center/Midground):** ${firstNonEmpty(details.mainFocus, '')}`,
        `* **Background & Atmosphere:** ${firstNonEmpty(details.backgroundAtmosphere, '')}`,
        `* **Foreground & Framing:** ${firstNonEmpty(details.foregroundFraming, '')}`,
        `* **Specific Details/Props:** ${firstNonEmpty(details.specificDetailsProps, '')}`,
        '',
        '**7. Text & Typography (\u6587\u5b57\u4e0e\u5b57\u4f53\uff0c\u5982\u6709):**',
        firstNonEmpty(structuredPromptDescription.textAndTypography, 'None'),
        '',
        '**8. Pattern / Production Constraints (\u56fe\u6848\u4e0e\u751f\u4ea7\u7ea6\u675f):**',
        firstNonEmpty(structuredPromptDescription.patternProductionConstraints, ''),
        '',
        '**9. Reference Usage (\u53c2\u8003\u8d44\u6599\u4f7f\u7528\u8bf4\u660e):**',
        firstNonEmpty(structuredPromptDescription.referenceUsage, ''),
        '',
        '**10. Negative Constraints (\u8d1f\u9762\u7ea6\u675f):**',
        firstNonEmpty(structuredPromptDescription.negativeConstraints, ''),
        '',
        '## Final Image Generation Prompt',
        firstNonEmpty(prompt, ''),
        '',
        '## Negative Prompt',
        firstNonEmpty(negativePrompt, '')
    ];

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
            const prompt = firstNonEmpty(item.prompt, '');
            const negativePrompt = firstNonEmpty(item.negativePrompt, item.negative_prompt, '');
            const generationPrompt = firstNonEmpty(
                item.generationPrompt,
                buildStructuredPromptPackage({ structuredPromptDescription, prompt, negativePrompt }),
                prompt
            );
            const referenceUsage = firstNonEmpty(
                item.referenceUsage,
                structuredPromptDescription?.referenceUsage,
                hasAvailableReferences
                    ? 'Use the project reference materials for composition, pattern density, color direction, product proportion, and craft suitability. Do not claim external pages or images were crawled, and do not copy trademarks, logos, or protected elements.'
                    : ''
            );

            return {
                taskId: firstNonEmpty(item.taskId, `concept_${String(index + 1).padStart(2, '0')}`),
                ...(firstNonEmpty(item.productTaskId) ? { productTaskId: firstNonEmpty(item.productTaskId) } : {}),
                title: firstNonEmpty(item.title, `Concept ${index + 1}`),
                ...(firstNonEmpty(item.product, item.productName) ? { product: firstNonEmpty(item.product, item.productName) } : {}),
                targetSize: firstNonEmpty(item.targetSize, ''),
                purpose: firstNonEmpty(item.purpose, ''),
                ...(structuredPromptDescription ? { structuredPromptDescription } : {}),
                prompt,
                generationPrompt,
                negativePrompt,
                modelRecommendation: firstNonEmpty(item.modelRecommendation, 'custom-image-t8-nano-banana-3-1-flash'),
                alternativeModelRecommendation: firstNonEmpty(item.alternativeModelRecommendation, ''),
                modelReason: firstNonEmpty(item.modelReason, ''),
                referenceRequired: Boolean(item.referenceRequired) || hasAvailableReferences || referenceIds.length > 0,
                referenceIds: referenceIds.length > 0 ? referenceIds : availableReferenceIds,
                referenceUsage,
                notes: Array.isArray(item.notes) ? item.notes : []
            };
        });
}

function normalizeHermesGenerationReadiness(value, fallback = {}) {
    const readyForImageGeneration = isPlainObject(value) && typeof value.readyForImageGeneration === 'boolean'
        ? value.readyForImageGeneration
        : Boolean(fallback.readyForImageGeneration);
    const reason = isPlainObject(value)
        ? firstNonEmpty(
            value.reason,
            fallback.reason,
            readyForImageGeneration
                ? 'Product task prompts generated.'
                : 'P3-A only generates design tasks and prompts. Image generation is handled by MYML-CANVAS later.'
        )
        : firstNonEmpty(
            fallback.reason,
            readyForImageGeneration
                ? 'Product task prompts generated.'
                : 'P3-A only generates design tasks and prompts. Image generation is handled by MYML-CANVAS later.'
        );
    const status = firstNonEmpty(
        isPlainObject(value) ? value.status : null,
        fallback.status,
        readyForImageGeneration ? 'ready' : 'not_ready'
    );

    return {
        readyForImageGeneration,
        status,
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

function normalizeHermesApiPayload(payload, { projectCode, envelope, mode }) {
    const lightweightMode = mode === HERMES_RESPONSE_MODE_LIGHTWEIGHT ||
        payload?.lightweightMode === true ||
        payload?.mode === HERMES_RESPONSE_MODE_LIGHTWEIGHT;
    validateHermesP1Response(payload, { lightweightMode });
    const project = normalizeHermesProjectFields(payload.project, projectCode);
    const projectBrief = normalizeHermesProjectBrief(payload.projectBrief, project);
    const productTasks = normalizeHermesProductTasks(payload.productTasks);
    const multiProductBundle = payload.multiProductBundle === true || productTasks.length > 0;
    const references = normalizeHermesReferences(payload.references, project);
    const designStrategy = lightweightMode ? null : normalizeHermesDesignStrategy(payload.designStrategy);
    const designTasks = lightweightMode ? [] : normalizeHermesDesignTasks(payload.designTasks, references);
    const results = lightweightMode ? [] : (Array.isArray(payload.results) ? payload.results : []);
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
        mode: lightweightMode ? HERMES_RESPONSE_MODE_LIGHTWEIGHT : firstNonEmpty(payload.mode, HERMES_RESPONSE_MODE_FULL),
        lightweightMode,
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
    if (multiProductBundle) normalized.multiProductBundle = true;
    if (productTasks.length > 0) normalized.productTasks = productTasks;
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
    if (firstNonEmpty(payload.fallbackReason)) normalized.fallbackReason = firstNonEmpty(payload.fallbackReason);
    if (lightweightMode || projectBrief || designStrategy || designTasks.length > 0 || payload.generationReadiness) {
        normalized.generationReadiness = normalizeHermesGenerationReadiness(payload.generationReadiness);
    }

    return redactSensitiveFieldsDeep(normalized);
}

async function callHermesApi({ user, projectCode, message, config, mode }) {
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
    const responseMode = normalizeHermesResponseMode(mode);
    const systemPrompt = responseMode === HERMES_RESPONSE_MODE_LIGHTWEIGHT
        ? HERMES_LIGHTWEIGHT_DECOMPOSITION_SYSTEM_PROMPT
        : HERMES_API_SYSTEM_PROMPT;

    const body = {
        model: config.model,
        stream: false,
        messages: [
            {
                role: 'system',
                content: systemPrompt,
            },
            {
                role: 'user',
                content: JSON.stringify({
                    projectCode,
                    message: message || '',
                    mode: responseMode,
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
                        lightweightDecompositionOnly: responseMode === HERMES_RESPONSE_MODE_LIGHTWEIGHT,
                    },
                }),
            },
        ],
    };

    console.log('[HermesClient] Calling Hermes API', {
        url,
        model: config.model,
        mode: responseMode,
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
    const normalized = normalizeHermesApiPayload(parsedPayload, { projectCode, envelope, mode: responseMode });

    console.log('[HermesClient] Hermes API completed', {
        projectCode,
        model: config.model,
        mode: responseMode,
        elapsedMs: Date.now() - startedAt,
        resultCount: normalized.results.length,
    });

    return normalized;
}

function summarizeProjectForProductPrompt(project) {
    if (!isPlainObject(project)) return {};
    return redactSensitiveFieldsDeep({
        code: firstNonEmpty(project.code, project.projectCode),
        name: firstNonEmpty(project.name, project.projectName),
        category: project.category,
        craft: project.craft,
        sizeRequirement: project.sizeRequirement,
        quantityRequirement: project.quantityRequirement,
        developmentRequirement: firstNonEmpty(project.developmentRequirement, project.brief, project.objective)
    });
}

function normalizeProductTaskForPrompt(productTask, index = 0) {
    const item = isPlainObject(productTask) ? productTask : {};
    return redactSensitiveFieldsDeep({
        productTaskId: firstNonEmpty(item.productTaskId, item.taskId, item.id, `product_${String(index + 1).padStart(2, '0')}`),
        product: firstNonEmpty(item.product, item.productName, item.name, `Product ${index + 1}`),
        size: firstNonEmpty(item.size, item.targetSize, item.sizeRequirement, ''),
        referenceHint: firstNonEmpty(item.referenceHint, item.reference, item.referenceUsage, ''),
        designFocus: firstNonEmpty(item.designFocus, item.focus, item.purpose, ''),
        referenceIds: normalizeStringArray(item.referenceIds),
        priority: normalizeOptionalPositiveInteger(item.priority) || index + 1
    });
}

function getConceptTaskIdForProductTask(productTaskId, index = 0) {
    const normalizedProductTaskId = firstNonEmpty(productTaskId, '');
    const match = normalizedProductTaskId.match(/(\d+)/);
    const parsed = match ? Number.parseInt(match[1], 10) : NaN;
    const number = Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1;
    return `concept_${String(number).padStart(2, '0')}`;
}

function normalizeHermesProductTaskPromptPayload(payload, { productTask, productTaskIndex, references }) {
    if (!isPlainObject(payload)) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes product task prompt response must be a JSON object.',
            502
        );
    }
    if (!isPlainObject(payload.designTask)) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes product task prompt response is missing designTask.',
            502
        );
    }

    const normalizedProductTask = normalizeProductTaskForPrompt(productTask, productTaskIndex);
    const productTaskId = firstNonEmpty(
        payload.productTaskId,
        payload.designTask.productTaskId,
        normalizedProductTask.productTaskId
    );
    const expectedDesignTaskId = getConceptTaskIdForProductTask(productTaskId, productTaskIndex);
    const designTaskInput = {
        ...payload.designTask,
        productTaskId,
        taskId: expectedDesignTaskId,
        product: firstNonEmpty(payload.designTask.product, normalizedProductTask.product),
        targetSize: firstNonEmpty(payload.designTask.targetSize, normalizedProductTask.size),
        referenceIds: normalizeStringArray(payload.designTask.referenceIds).length > 0
            ? payload.designTask.referenceIds
            : normalizedProductTask.referenceIds,
        referenceUsage: firstNonEmpty(payload.designTask.referenceUsage, normalizedProductTask.referenceHint)
    };
    const [designTask] = normalizeHermesDesignTasks([designTaskInput], references);

    if (!designTask?.prompt) {
        throw createHermesError(
            'HERMES_INVALID_RESPONSE',
            'Hermes product task prompt response is missing prompt.',
            502
        );
    }

    return redactSensitiveFieldsDeep({
        productTaskId,
        status: 'completed',
        designTask
    });
}

async function callHermesProductTaskPromptApi({
    user,
    projectCode,
    project,
    projectBrief,
    references,
    productTask,
    productTasks,
    productTaskIndex,
    config
}) {
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
    const normalizedProductTask = normalizeProductTaskForPrompt(productTask, productTaskIndex);

    const body = {
        model: config.model,
        stream: false,
        messages: [
            {
                role: 'system',
                content: HERMES_PRODUCT_TASK_PROMPT_SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: JSON.stringify({
                    projectCode,
                    project: summarizeProjectForProductPrompt(project),
                    projectBrief: redactSensitiveFieldsDeep(projectBrief || {}),
                    references: redactSensitiveFieldsDeep(references || { images: [], links: [], notes: [] }),
                    productTask: normalizedProductTask,
                    expectedDesignTaskId: getConceptTaskIdForProductTask(
                        normalizedProductTask.productTaskId,
                        productTaskIndex
                    ),
                    productTasks: Array.isArray(productTasks)
                        ? productTasks.map((item, index) => normalizeProductTaskForPrompt(item, index))
                        : [normalizedProductTask],
                    maxDesignsPerGeneration: MAX_DESIGNS_PER_GENERATION,
                    user: {
                        id: user?.id || null,
                        username: user?.username || null,
                    },
                    boundaries: {
                        oneProductTaskOnly: true,
                        noRealImageGeneration: true,
                        noExternalImageDownload: true,
                        noExternalLinkVisit: true,
                        noAmazonCrawl: true,
                        referenceImagesAreMetadataOnly: true
                    },
                }),
            },
        ],
    };

    console.log('[HermesClient] Calling Hermes product task prompt API', {
        url,
        model: config.model,
        timeoutMs: config.timeoutMs,
        projectCode,
        productTaskId: normalizedProductTask.productTaskId
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
                `Hermes product task prompt timed out after ${config.timeoutMs}ms.`,
                504
            );
        }
        throw createHermesError(
            'HERMES_API_REQUEST_FAILED',
            `Hermes product task prompt request failed: ${error?.message || error}`,
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
            'Hermes product task prompt returned a non-JSON envelope.',
            502
        );
    }

    if (!response.ok) {
        const messageText =
            envelope?.error?.message ||
            envelope?.message ||
            response.statusText ||
            'Hermes product task prompt request failed.';
        throw createHermesError(
            response.status === 401 || response.status === 403
                ? 'HERMES_AUTH_ERROR'
                : 'HERMES_API_ERROR',
            `Hermes product task prompt failed: ${String(messageText).slice(0, 240)}`,
            response.status
        );
    }

    const content = envelope?.choices?.[0]?.message?.content;
    const parsedPayload = parseHermesJsonContent(content);
    const normalized = normalizeHermesProductTaskPromptPayload(parsedPayload, {
        productTask,
        productTaskIndex,
        references
    });

    console.log('[HermesClient] Hermes product task prompt completed', {
        projectCode,
        model: config.model,
        productTaskId: normalized.productTaskId,
        elapsedMs: Date.now() - startedAt
    });

    return normalized;
}

function buildMockDesignTaskForProduct({ productTask, productTaskIndex, references }) {
    const normalizedProductTask = normalizeProductTaskForPrompt(productTask, productTaskIndex);
    const product = normalizedProductTask.product || `Product ${productTaskIndex + 1}`;
    const prompt = [
        `Create a production-ready surface pattern for ${product}.`,
        normalizedProductTask.size ? `Target product size: ${normalizedProductTask.size}.` : '',
        normalizedProductTask.designFocus || 'Keep the visual system coherent with the full product set.',
        'Use a refined decorative composition, clean repeatable motifs, and craft-safe color separation.'
    ].filter(Boolean).join(' ');
    const [designTask] = normalizeHermesDesignTasks([{
        taskId: `concept_${String(productTaskIndex + 1).padStart(2, '0')}`,
        productTaskId: normalizedProductTask.productTaskId,
        title: `${product} pattern concept`,
        product,
        targetSize: normalizedProductTask.size,
        purpose: normalizedProductTask.designFocus,
        structuredPromptDescription: {
            coreSubjectAndTheme: `A cohesive decorative pattern concept for ${product}.`,
            productContextAndUsage: normalizedProductTask.size
                ? `Designed for ${product} at ${normalizedProductTask.size}.`
                : `Designed for ${product}.`,
            artStyleAndMedium: 'Clean production-ready surface pattern with refined decorative linework.',
            colorPaletteAndMood: 'Coherent project color direction with balanced contrast and a polished commercial mood.',
            compositionAndLayout: 'Repeatable layout with stable rhythm, clear focal motifs, and clean negative space.',
            detailedVisualElements: {
                mainFocus: normalizedProductTask.designFocus || `The central motif system for ${product}.`,
                backgroundAtmosphere: 'Subtle supporting texture that keeps the product printable and not visually noisy.',
                foregroundFraming: 'Light framing elements that support the repeat without blocking product usability.',
                specificDetailsProps: normalizedProductTask.referenceHint || 'Reference cues are used only as high-level visual direction.'
            },
            textAndTypography: 'None',
            patternProductionConstraints: 'Avoid tiny unreadable details, protected logos, cluttered composition, and unprintable color complexity.',
            referenceUsage: normalizedProductTask.referenceHint,
            negativeConstraints: 'No trademarks, logos, photorealistic faces, low-resolution artifacts, incorrect text, or unrelated background objects.'
        },
        prompt,
        negativePrompt: 'low quality, blurry details, incorrect text, trademarks, logos, cluttered composition, unrelated objects',
        modelRecommendation: 'custom-image-t8-nano-banana-3-1-flash',
        alternativeModelRecommendation: 'custom-image-t8-gpt-image-2',
        modelReason: 'Use Nano Banana for fast decorative style exploration; use GPT Image 2 if typography or tighter layout stability is required.',
        referenceRequired: normalizedProductTask.referenceIds.length > 0,
        referenceIds: normalizedProductTask.referenceIds,
        referenceUsage: normalizedProductTask.referenceHint,
        notes: []
    }], references);

    return {
        productTaskId: normalizedProductTask.productTaskId,
        status: 'completed',
        designTask
    };
}

export async function runHermesProjectMock({ user, projectCode, message, mode }) {
    const requestId = `mock_req_${crypto.randomUUID()}`;
    const runId = `mock_run_${crypto.randomUUID()}`;
    const responseMode = normalizeHermesResponseMode(mode);
    if (responseMode === HERMES_RESPONSE_MODE_LIGHTWEIGHT) {
        return {
            status: 'completed',
            mode: HERMES_RESPONSE_MODE_LIGHTWEIGHT,
            lightweightMode: true,
            hermesRequestId: requestId,
            hermesRunId: runId,
            project: {
                code: projectCode,
                projectCode,
                name: `Mock ${projectCode} Product Decomposition`,
                projectName: `Mock ${projectCode} Product Decomposition`,
                category: 'Textile pattern',
                customer: user?.username || 'MYML internal designer',
                developmentRequirement: message || `Decompose product tasks for ${projectCode}.`,
                craft: 'Digital print mock',
                sizeRequirement: 'Project-defined sizes',
                quantityRequirement: 1
            },
            projectBrief: {
                summary: `Lightweight decomposition for ${projectCode}.`,
                category: 'Textile pattern',
                craft: 'Digital print mock',
                sizeRequirement: 'Project-defined sizes',
                quantityRequirement: 1
            },
            multiProductBundle: false,
            productTasks: [
                {
                    productTaskId: 'product_01',
                    product: 'Mock product',
                    size: 'Project-defined size',
                    referenceHint: 'Use company references if present.',
                    designFocus: 'Prepare Stage 2 prompt generation.',
                    referenceIds: [],
                    priority: 1
                }
            ],
            references: { images: [], links: [], notes: [] },
            expectedDesignTaskCount: 1,
            actualDesignTaskCount: 0,
            maxDesignsPerGeneration: MAX_DESIGNS_PER_GENERATION,
            batchPlan: {
                totalRequired: 1,
                maxPerBatch: MAX_DESIGNS_PER_GENERATION,
                totalBatches: 1,
                currentBatch: 1,
                batchLabel: 'Batch 1 / 1',
                remainingCount: 0,
                reason: 'Mock lightweight decomposition only.'
            },
            generationReadiness: {
                readyForImageGeneration: false,
                reason: 'Lightweight decomposition only. Prompt generation is handled in Stage 2.'
            },
            fallbackReason: 'mock_lightweight_decomposition'
        };
    }

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

export async function runHermesProjectClient({ user, projectCode, message, mode = HERMES_RESPONSE_MODE_FULL, env = process.env } = {}) {
    const config = getHermesClientConfig(env);
    if (config.mode === 'api') {
        return await callHermesApi({
            user,
            projectCode,
            message,
            config,
            mode,
        });
    }

    return await runHermesProjectMock({ user, projectCode, message, mode });
}

export async function runHermesProductTaskPromptClient({
    user,
    projectCode,
    project,
    projectBrief,
    references,
    productTask,
    productTasks,
    productTaskIndex = 0,
    env = process.env
} = {}) {
    const config = getHermesClientConfig(env);
    if (config.mode === 'api') {
        return await callHermesProductTaskPromptApi({
            user,
            projectCode,
            project,
            projectBrief,
            references,
            productTask,
            productTasks,
            productTaskIndex,
            config
        });
    }

    return buildMockDesignTaskForProduct({
        productTask,
        productTaskIndex,
        references
    });
}

export default {
    getHermesClientConfig,
    getHermesStartupSummary,
    runHermesProjectMock,
    runHermesProjectClient,
    runHermesProductTaskPromptClient
};
