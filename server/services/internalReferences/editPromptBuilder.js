function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function valueToText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
        return value.map(valueToText).filter(Boolean).join('\n');
    }
    if (typeof value === 'object') {
        return Object.entries(value)
            .map(([key, item]) => {
                const text = valueToText(item);
                return text ? `${key}: ${text}` : '';
            })
            .filter(Boolean)
            .join('\n');
    }
    return String(value).trim();
}

function getTaskInput(task = {}) {
    return task.input && typeof task.input === 'object' ? task.input : {};
}

function getDesignIntent(task = {}) {
    const input = getTaskInput(task);
    const structuredPromptDescription = valueToText(input.structuredPromptDescription || task.structuredPromptDescription);
    const generationPrompt = cleanString(input.generationPrompt || task.generationPrompt);
    const finalPrompt = cleanString(input.finalPrompt || input.prompt || task.prompt);
    const negativePrompt = cleanString(input.negativePrompt || task.negativePrompt);

    return {
        structuredPromptDescription,
        generationPrompt,
        finalPrompt,
        negativePrompt
    };
}

export const FIXED_IMAGE_NEGATIVE_PROMPT = [
    'blurry details',
    'distorted text',
    'misspelled words',
    'unreadable typography',
    'broken letters',
    'extra letters',
    'malformed icons',
    'deformed objects',
    'warped product shape',
    'changed product structure',
    'messy layout',
    'low resolution',
    'pixelated edges',
    'noisy texture',
    'over-sharpened artifacts',
    'duplicated elements',
    'floating fragments',
    'watermark',
    'logo',
    'trademark',
    'celebrity likeness',
    'copyrighted character',
    'real band name',
    'photorealistic clutter',
    'muddy colors',
    'over-dense micro details',
    'changed mockup',
    'changed carrier shape',
    'changed camera angle',
    'changed lighting',
    'changed background',
    'new product mockup',
    'removed product parts',
    'altered print area'
].join(', ');

export function buildPromptWithFixedNegativePrompt(task = {}, basePrompt = '') {
    const designIntent = getDesignIntent(task);
    const prompt = cleanString(basePrompt) || designIntent.generationPrompt || designIntent.finalPrompt || '';
    const negativePrompt = [designIntent.negativePrompt, FIXED_IMAGE_NEGATIVE_PROMPT]
        .map(cleanString)
        .filter(Boolean)
        .join(', ');

    if (!negativePrompt) return prompt;

    return [
        prompt || 'Follow the current Hermes design task.',
        '',
        '## Negative Prompt',
        negativePrompt
    ].join('\n');
}

export function buildCarrierPreservingHiddenReferenceEditPrompt(task = {}) {
    const designIntent = getDesignIntent(task);

    return [
        '## Carrier-Preserving Internal Reference Image Edit',
        '',
        'Task type:',
        'Edit the uploaded internal reference image with minimal structural change.',
        'This is an image-to-image replacement task, not a redesign task.',
        '',
        'Preserve:',
        '- Preserve the product carrier / mockup / template structure.',
        '- Preserve object positions, proportions, framing, lighting, shadows, product angle, print area placement, and overall production-ready layout.',
        '- Preserve the product-specific layout logic from the reference image.',
        '',
        'Only replace:',
        '- Only replace the existing printed artwork, theme graphics, text, decorative motifs, and pattern content.',
        '- Keep the same product-fit structure and print placement.',
        '',
        'New design goal:',
        '- Use the current Hermes design task as the new theme, element, palette, typography, and pattern direction.',
        '- Preserve the current project brief theme direction.',
        '- Do not copy the old internal reference image artwork content, text, characters, icons, logos, or original theme.',
        '',
        'Internal reference image usage:',
        '- Use the uploaded internal reference image as the edit target and product-fit template.',
        '- Do not copy the old artwork content.',
        '- Keep only the carrier structure, product layout, print area logic, composition density, and production-ready placement.',
        '',
        'Current Hermes structured design intent:',
        designIntent.structuredPromptDescription || 'Use the Hermes design task prompt as the design intent.',
        '',
        'Current Hermes generation prompt:',
        designIntent.generationPrompt || designIntent.finalPrompt || 'Follow the current project design task.',
        '',
        'Current negative prompt:',
        designIntent.negativePrompt || 'Avoid cluttered composition, unreadable text, low resolution, trademarks, logos, copyrighted characters, celebrity likenesses, watermarks, incorrect text, and irrelevant elements.',
        '',
        'Do not:',
        '- Do not create a new mockup.',
        '- Do not change the product type.',
        '- Do not change the carrier shape, angle, lighting, background, framing, or layout.',
        '- Do not turn the result into a flat artwork-only image unless the reference image is already a flat artwork template.',
        '- Do not include trademarks, celebrity likenesses, copyrighted characters, real band names, watermarks, or low-resolution artifacts.',
        '',
        'Fixed negative prompt:',
        FIXED_IMAGE_NEGATIVE_PROMPT
    ].join('\n');
}
