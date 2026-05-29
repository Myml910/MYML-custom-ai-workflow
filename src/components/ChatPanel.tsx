/**
 * ChatPanel.tsx
 * 
 * Agent chat panel that slides in from the right side.
 * Shows greeting, inspiration suggestions, chat messages, and input.
 * Supports drag-drop of image/video nodes from canvas.
 * Includes chat history panel for viewing past conversations.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, History, Paperclip, Globe, Settings, Send, Sparkles, Plus, Loader2, ChevronLeft, ChevronDown, ChevronUp, Trash2, MessageSquare } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { useChatAgent } from '../hooks/useChatAgent';
import type { ChatMessage as ChatMessageType, ChatSession, HermesRunPayload } from '../hooks/useChatAgent';
import { Language, t } from '../i18n/translations';
import type { AgentCanvasContext } from '../utils/agentCanvasContext';
import { createImageTask, waitForImageTaskCompletion } from '../services/generationService';
import type { GenerationTask, GenerationTaskStatus } from '../services/generationService';

// ============================================================================
// TYPES
// ============================================================================

interface AttachedMedia {
    type: 'image' | 'video';
    url: string;
    nodeId: string;
    base64?: string;
}

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    userName?: string;
    isDraggingNode?: boolean;
    onNodeDrop?: (nodeId: string, url: string, type: 'image' | 'video') => void;
    canvasTheme?: 'dark' | 'light';
    language?: Language;
    getCanvasContext?: (message?: string) => AgentCanvasContext;
    onHermesRunReceived?: (hermesRun: HermesRunPayload) => void;
}

type HermesDesignTask = NonNullable<HermesRunPayload['designTasks']>[number];
type HermesDraftStatus = 'idle' | 'submitting' | 'queued' | 'running' | 'polling' | 'completed' | 'failed';

interface HermesDraftState {
    status: HermesDraftStatus;
    taskId?: string;
    resultUrl?: string | null;
    progress?: number | null;
    errorMessage?: string | null;
}

const CHAT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const HERMES_DRAFT_T8_GPT_IMAGE_MODEL = 'custom-image-t8-gpt-image-2';
const HERMES_DRAFT_T8_NANO_BANANA_MODEL = 'custom-image-t8-nano-banana-3-1-flash';
const HERMES_DRAFT_DEFAULT_IMAGE_MODEL = HERMES_DRAFT_T8_NANO_BANANA_MODEL;

function getMediaTooLargeMessage(language: Language): string {
    return language === 'zh'
        ? '\u56fe\u7247\u592a\u5927\uff0c\u8bf7\u538b\u7f29\u540e\u518d\u53d1\u9001\u3002'
        : 'The image is too large. Please compress it before sending.';
}

function estimateBase64Bytes(value?: string): number {
    if (!value) return 0;
    const base64 = value.includes(',') ? value.split(',').pop() || '' : value;
    const normalized = base64.replace(/\s/g, '');
    if (!normalized) return 0;

    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

const HERMES_REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_HERMES_FIELD_PATTERN = /(api_?key|apikey|access_?key|password|passwd|pwd|secret|token|authorization|(^|[_\-\s])auth($|[_\-\s])|cookie|session|phone|mobile|tel|email|id_?card|idcard|\u8eab\u4efd\u8bc1|\u624b\u673a\u53f7|\u7535\u8bdd|\u90ae\u7bb1|\u5ba2\u6237\u8054\u7cfb\u65b9\u5f0f|\u8054\u7cfb\u4eba\u7535\u8bdd|credential)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyProjectValue(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

function getProjectField(project: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        const value = project[key];
        if (!isEmptyProjectValue(value)) return value;
    }
    return undefined;
}

function isSensitiveHermesField(key: string): boolean {
    return SENSITIVE_HERMES_FIELD_PATTERN.test(key);
}

function maskHermesValue(_value: unknown): string {
    return HERMES_REDACTED_VALUE;
}

function redactHermesValueDeep(value: unknown, key?: string): unknown {
    if (key && isSensitiveHermesField(key)) return HERMES_REDACTED_VALUE;

    if (Array.isArray(value)) {
        return value.map(item => redactHermesValueDeep(item));
    }

    if (!isRecord(value)) {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([nestedKey, nestedValue]) => [
            nestedKey,
            redactHermesValueDeep(nestedValue, nestedKey),
        ])
    );
}

function formatHermesFieldLabel(key: string): string {
    return key
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatHermesValue(
    value: unknown,
    options: { sensitive?: boolean; compact?: boolean } = {}
): string {
    if (options.sensitive) return maskHermesValue(value);
    const safeValue = redactHermesValueDeep(value);
    if (safeValue === null) return 'null';
    if (safeValue === undefined) return '';
    if (typeof safeValue === 'string') return safeValue;
    if (typeof safeValue === 'number' || typeof safeValue === 'boolean') return String(safeValue);

    try {
        const formatted = JSON.stringify(safeValue, null, options.compact ? 0 : 2);
        if (typeof formatted !== 'string') return String(safeValue);
        return options.compact ? formatted.replace(/\s+/g, ' ') : formatted;
    } catch {
        return '[Unsupported value]';
    }
}

function getHermesStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => formatHermesValue(item, { compact: true }).trim())
        .filter(Boolean);
}

const HERMES_REFERENCE_TEXT_LIMIT = 180;

function truncateHermesText(value: string, limit = HERMES_REFERENCE_TEXT_LIMIT): string {
    return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function isSafeHttpReferenceUrl(value?: string): boolean {
    try {
        const parsed = new URL(value || '');
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function getReferenceDomain(value?: string): string {
    try {
        return new URL(value || '').hostname || value || '-';
    } catch {
        return value || '-';
    }
}

function getReferenceUrl(item: { url?: string; resolvedUrl?: string } | null | undefined): string | undefined {
    return item?.url || item?.resolvedUrl || undefined;
}

function isRelativeTempReference(value: string): boolean {
    return /^(?:\.?\/)?temp[\\/]/i.test(value.trim());
}

function getUnavailableReferenceMessage(language: Language): string {
    return language === 'zh'
        ? '\u56fe\u7247\u5b57\u6bb5\u5df2\u8fd4\u56de\uff0c\u4f46\u4e0d\u662f\u53ef\u76f4\u63a5\u8bbf\u95ee\u7684 http/https URL'
        : 'The image field was returned, but it is not a directly accessible http/https URL.';
}

function formatReferenceRawValue(value: unknown, language: Language): string {
    if (typeof value === 'string') {
        const rawValue = value.trim();
        if (rawValue && !isSafeHttpReferenceUrl(rawValue) && isRelativeTempReference(rawValue)) {
            return getUnavailableReferenceMessage(language);
        }
        return truncateHermesText(formatHermesValue(rawValue, { compact: true }));
    }

    return truncateHermesText(formatHermesValue(value, { compact: true }));
}

function formatReferenceNote(note: unknown, language: Language): string {
    if (typeof note === 'string') {
        return truncateHermesText(formatHermesValue(note, { compact: true }).trim());
    }

    if (!isRecord(note)) {
        return truncateHermesText(formatHermesValue(note, { compact: true }).trim());
    }

    const parts = [
        note.label ? formatHermesValue(note.label, { compact: true }) : '',
        note.field ? formatHermesValue(note.field, { compact: true }) : '',
        note.message ? formatHermesValue(note.message, { compact: true }) : '',
        note.rawValue !== undefined ? formatReferenceRawValue(note.rawValue, language) : '',
    ].map(part => part.trim()).filter(Boolean);

    return truncateHermesText(parts.length > 0 ? parts.join(' / ') : formatHermesValue(note, { compact: true }));
}

async function writeClipboardText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

function safeHermesCopyValue(value: unknown): string {
    return formatHermesValue(value).trim();
}

function buildStructuredPromptMarkdown(task: HermesDesignTask): string {
    const structuredPrompt = isRecord(task.structuredPromptDescription) ? task.structuredPromptDescription : {};
    const details = isRecord(structuredPrompt.detailedVisualElements) ? structuredPrompt.detailedVisualElements : {};

    return [
        '## Pattern Design Prompt Description',
        '',
        '**1. Core Subject & Theme (\u6838\u5fc3\u4e3b\u4f53\u4e0e\u4e3b\u9898):**',
        safeHermesCopyValue(structuredPrompt.coreSubjectAndTheme),
        '',
        '**2. Product Context & Usage (\u4ea7\u54c1\u8bed\u5883\u4e0e\u7528\u9014):**',
        safeHermesCopyValue(structuredPrompt.productContextAndUsage),
        '',
        '**3. Art Style & Medium (\u827a\u672f\u98ce\u683c\u4e0e\u5a92\u4ecb):**',
        safeHermesCopyValue(structuredPrompt.artStyleAndMedium),
        '',
        '**4. Color Palette & Mood (\u914d\u8272\u4e0e\u6c1b\u56f4):**',
        safeHermesCopyValue(structuredPrompt.colorPaletteAndMood),
        '',
        '**5. Composition & Layout (\u6784\u56fe\u4e0e\u5e03\u5c40):**',
        safeHermesCopyValue(structuredPrompt.compositionAndLayout),
        '',
        '**6. Detailed Visual Elements (\u5206\u5c42\u7ec6\u8282\u63cf\u8ff0):**',
        `* **Main Focus (Center/Midground):** ${safeHermesCopyValue(details.mainFocus)}`,
        `* **Background & Atmosphere:** ${safeHermesCopyValue(details.backgroundAtmosphere)}`,
        `* **Foreground & Framing:** ${safeHermesCopyValue(details.foregroundFraming)}`,
        `* **Specific Details/Props:** ${safeHermesCopyValue(details.specificDetailsProps)}`,
        '',
        '**7. Text & Typography (\u6587\u5b57\u4e0e\u5b57\u4f53\uff0c\u5982\u6709):**',
        safeHermesCopyValue(structuredPrompt.textAndTypography || 'None'),
        '',
        '**8. Pattern / Production Constraints (\u56fe\u6848\u4e0e\u751f\u4ea7\u7ea6\u675f):**',
        safeHermesCopyValue(structuredPrompt.patternProductionConstraints),
        '',
        '**9. Reference Usage (\u53c2\u8003\u8d44\u6599\u4f7f\u7528\u8bf4\u660e):**',
        safeHermesCopyValue(structuredPrompt.referenceUsage || task.referenceUsage),
        '',
        '**10. Negative Constraints (\u8d1f\u9762\u7ea6\u675f):**',
        safeHermesCopyValue(structuredPrompt.negativeConstraints),
        '',
        '## Final Image Generation Prompt',
        safeHermesCopyValue(task.prompt),
        '',
        '## Negative Prompt',
        safeHermesCopyValue(task.negativePrompt),
    ].join('\n');
}

function buildTaskGenerationPackage(task: HermesDesignTask): string {
    const referenceIds = getHermesStringList(task.referenceIds).join(', ');
    const notes = getHermesStringList(task.notes);

    return [
        `# ${safeHermesCopyValue(task.title || task.taskId || 'Pattern Design Task')}`,
        '',
        `- Task ID: ${safeHermesCopyValue(task.taskId)}`,
        `- Target Size: ${safeHermesCopyValue(task.targetSize)}`,
        `- Purpose: ${safeHermesCopyValue(task.purpose)}`,
        `- Model Recommendation: ${safeHermesCopyValue(task.modelRecommendation)}`,
        `- Alternative Model Recommendation: ${safeHermesCopyValue(task.alternativeModelRecommendation)}`,
        `- Model Reason: ${safeHermesCopyValue(task.modelReason)}`,
        `- Reference Required: ${task.referenceRequired ? 'true' : 'false'}`,
        `- Reference IDs: ${referenceIds}`,
        `- Reference Usage: ${safeHermesCopyValue(task.referenceUsage)}`,
        '',
        buildStructuredPromptMarkdown(task),
        '',
        notes.length > 0 ? `## Notes\n- ${notes.join('\n- ')}` : '## Notes\nNone',
    ].join('\n');
}

function getTaskResultUrl(task: GenerationTask): string | null {
    if (typeof task.resultUrl === 'string' && task.resultUrl.trim()) {
        return task.resultUrl.trim();
    }

    const output = isRecord(task.output) ? task.output : null;
    if (!output) return null;

    const directUrl = output.resultUrl || output.url || output.imageUrl;
    if (typeof directUrl === 'string' && directUrl.trim()) {
        return directUrl.trim();
    }

    const images = output.images;
    if (Array.isArray(images)) {
        for (const image of images) {
            if (typeof image === 'string' && image.trim()) return image.trim();
            if (isRecord(image)) {
                const url = image.url || image.resultUrl || image.imageUrl;
                if (typeof url === 'string' && url.trim()) return url.trim();
            }
        }
    }

    return null;
}

function mapImageTaskStatusToDraftStatus(status: GenerationTaskStatus): HermesDraftStatus {
    if (status === 'completed') return 'completed';
    if (status === 'failed' || status === 'timeout' || status === 'cancelled') return 'failed';
    if (status === 'queued') return 'queued';
    if (status === 'polling') return 'polling';
    return 'running';
}

type HermesDraftModelNormalizationReason = 'none' | 'legacy' | 'default';

function getHermesDraftModelNormalization(model: unknown): {
    model: string;
    reason: HermesDraftModelNormalizationReason;
} {
    const normalized = safeHermesCopyValue(model);
    if (normalized === HERMES_DRAFT_T8_GPT_IMAGE_MODEL || normalized === HERMES_DRAFT_T8_NANO_BANANA_MODEL) {
        return { model: normalized, reason: 'none' };
    }
    if (normalized === 'custom-image-gpt-image-2') {
        return { model: HERMES_DRAFT_T8_GPT_IMAGE_MODEL, reason: 'legacy' };
    }
    if (normalized === 'custom-image-nano-banana-3-1-flash') {
        return { model: HERMES_DRAFT_T8_NANO_BANANA_MODEL, reason: 'legacy' };
    }
    return { model: HERMES_DRAFT_DEFAULT_IMAGE_MODEL, reason: 'default' };
}

function normalizeHermesDraftImageModel(model: unknown): string {
    return getHermesDraftModelNormalization(model).model;
}

function getSafeDraftErrorMessage(error: unknown, language: Language): string {
    const fallback = language === 'zh'
        ? '生成草稿失败，请稍后重试。'
        : 'Draft generation failed. Please try again later.';
    const quotaOrRejected = language === 'zh'
        ? '生成失败：供应商余额不足或请求被拒绝。'
        : 'Generation failed: provider quota is insufficient or the request was rejected.';
    const providerConfig = language === 'zh'
        ? '生成失败：请检查模型供应商额度或配置。'
        : 'Generation failed. Please check provider quota or configuration.';
    const raw = error instanceof Error ? error.message : String(error || '');

    if (!raw.trim()) return fallback;
    if (/(402|payment required|insufficient balance|quota|billing|balance)/i.test(raw)) {
        return quotaOrRejected;
    }
    if (/(403|401|unauthorized|forbidden|permission|credential|api[_ -]?key)/i.test(raw)) {
        return providerConfig;
    }
    if (SENSITIVE_HERMES_FIELD_PATTERN.test(raw) || /(sk-[a-z0-9_*.-]+|bearer|authorization|database_url|postgres|mysql|connection string)/i.test(raw)) {
        return fallback;
    }

    return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw;
}

const HermesResultCard: React.FC<{
    hermesRun: HermesRunPayload;
    canvasTheme: 'dark' | 'light';
    language: Language;
}> = ({ hermesRun, canvasTheme, language }) => {
    const [showAllProjectFields, setShowAllProjectFields] = useState(false);
    const [expandedStructuredPrompts, setExpandedStructuredPrompts] = useState<Set<string>>(() => new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [draftStates, setDraftStates] = useState<Record<string, HermesDraftState>>({});
    const copyResetTimerRef = useRef<number | null>(null);
    const isDark = canvasTheme === 'dark';
    const project = isRecord(hermesRun.project) ? hermesRun.project : {};
    const strategy = hermesRun.strategy || {};
    const designTask = hermesRun.designTask || {};
    const designStrategy = hermesRun.designStrategy || {};
    const designTasks = Array.isArray(hermesRun.designTasks) ? hermesRun.designTasks : [];
    const references = hermesRun.references || {};
    const referenceImages = Array.isArray(references.images)
        ? references.images.filter(item => item && (item.url || item.resolvedUrl || item.rawValue))
        : [];
    const referenceLinks = Array.isArray(references.links)
        ? references.links.filter(item => item && (item.url || item.resolvedUrl || item.rawValue))
        : [];
    const referenceNotes = Array.isArray(references.notes)
        ? references.notes.map(note => formatReferenceNote(note, language)).filter(Boolean)
        : [];
    const hasReferences = referenceImages.length > 0 || referenceLinks.length > 0 || referenceNotes.length > 0;
    const generationReadiness = hermesRun.generationReadiness || null;
    const assets = hermesRun.assets || [];
    const text = language === 'zh'
        ? {
            title: 'Hermes 项目执行',
            fields: '项目字段',
            strategy: '生成策略',
            assets: '图片结果',
            code: '项目编号',
            category: '品类',
            customer: '客户',
            craft: '工艺',
            size: '尺寸',
            quantity: '数量',
            model: '模型',
            mode: '模式',
            reason: '原因',
            prompt: '设计任务',
            placeholder: 'Mock 图片资产',
        }
        : {
            title: 'Hermes Project Run',
            fields: 'Project Fields',
            strategy: 'Generation Strategy',
            assets: 'Image Results',
            code: 'Project Code',
            category: 'Category',
            customer: 'Customer',
            craft: 'Craft',
            size: 'Size',
            quantity: 'Quantity',
            model: 'Model',
            mode: 'Mode',
            reason: 'Reason',
            prompt: 'Design Task',
            placeholder: 'Mock image asset',
        };
    const fieldText = language === 'zh'
        ? {
            name: '\u9879\u76ee\u540d\u79f0',
            deadline: '\u4ea4\u671f',
            requirement: '\u5f00\u53d1\u9700\u6c42',
            allFields: '\u67e5\u770b\u5168\u90e8\u9879\u76ee\u5b57\u6bb5',
            hideFields: '\u6536\u8d77\u9879\u76ee\u5b57\u6bb5',
        }
        : {
            name: 'Project Name',
            deadline: 'Deadline',
            requirement: 'Requirement',
            allFields: 'View all project fields',
            hideFields: 'Hide project fields',
        };
    const proposalText = language === 'zh'
        ? {
            designStrategy: '\u8bbe\u8ba1\u7b56\u7565',
            designTasks: '\u8bbe\u8ba1\u4efb\u52a1',
            theme: '\u4e3b\u9898',
            visualDirection: '\u89c6\u89c9\u65b9\u5411',
            targetUser: '\u76ee\u6807\u7528\u6237',
            usageScenario: '\u4f7f\u7528\u573a\u666f',
            colorPalette: '\u914d\u8272',
            composition: '\u6784\u56fe',
            styleKeywords: '\u98ce\u683c\u5173\u952e\u8bcd',
            craftNotes: '\u5de5\u827a/\u6750\u8d28\u6ce8\u610f',
            avoid: '\u907f\u514d\u9879',
            targetSize: '\u76ee\u6807\u5c3a\u5bf8',
            purpose: '\u76ee\u7684',
            modelRecommendation: '\u63a8\u8350\u6a21\u578b',
            alternativeModelRecommendation: '\u5907\u9009\u6a21\u578b',
            modelReason: '\u63a8\u8350\u7406\u7531',
            draftModel: '\u8349\u7a3f\u751f\u6210\u6a21\u578b',
            modelMappedNotice: '\u5df2\u5c06\u65e7\u6a21\u578b\u6620\u5c04\u4e3a T8 \u53ef\u7528\u6a21\u578b\u3002',
            defaultModelNotice: '\u672a\u8bc6\u522b\u63a8\u8350\u6a21\u578b\uff0c\u5df2\u4f7f\u7528\u9ed8\u8ba4\u56fe\u6848\u8349\u7a3f\u6a21\u578b\uff1aT8 Nano Banana 3.1 Flash\u3002',
            referenceRequired: '\u9700\u8981\u53c2\u8003\u56fe',
            negativePrompt: 'Negative Prompt',
            notes: '\u5907\u6ce8',
            readiness: '\u6267\u884c\u72b6\u6001',
            references: '\u53c2\u8003\u8d44\u6599',
            referenceImages: '\u53c2\u8003\u56fe',
            referenceLinks: '\u53c2\u8003\u94fe\u63a5',
            noReferences: '\u5f53\u524d\u9879\u76ee\u672a\u8fd4\u56de\u53c2\u8003\u56fe\u6216\u53c2\u8003\u94fe\u63a5',
            openImageReference: '\u6253\u5f00\u53c2\u8003\u56fe',
            openReference: '\u6253\u5f00\u94fe\u63a5',
            addToCanvasSoon: '\u6dfb\u52a0\u5230\u753b\u5e03\uff08\u540e\u7eed\uff09',
            referenceUnavailable: '\u6682\u4e0d\u53ef\u76f4\u63a5\u5c55\u793a\uff1a\u9700\u8981\u516c\u53f8\u7cfb\u7edf\u56fe\u7247\u8bbf\u95ee\u89c4\u5219',
            referenceIds: 'Reference IDs',
            referenceUsage: '\u53c2\u8003\u7528\u6cd5',
            structuredPromptDescription: '\u7ed3\u6784\u5316\u63d0\u793a\u8bcd\u63cf\u8ff0',
            coreSubjectAndTheme: '\u6838\u5fc3\u4e3b\u4f53\u4e0e\u4e3b\u9898',
            productContextAndUsage: '\u4ea7\u54c1\u8bed\u5883\u4e0e\u7528\u9014',
            artStyleAndMedium: '\u827a\u672f\u98ce\u683c\u4e0e\u5a92\u4ecb',
            colorPaletteAndMood: '\u914d\u8272\u4e0e\u6c1b\u56f4',
            compositionAndLayout: '\u6784\u56fe\u4e0e\u5e03\u5c40',
            detailedVisualElements: '\u5206\u5c42\u7ec6\u8282',
            mainFocus: '\u4e3b\u89c6\u89c9',
            backgroundAtmosphere: '\u80cc\u666f\u4e0e\u6c1b\u56f4',
            foregroundFraming: '\u524d\u666f\u4e0e\u6846\u67b6',
            specificDetailsProps: '\u5177\u4f53\u7ec6\u8282/\u5143\u7d20',
            textAndTypography: '\u6587\u5b57\u4e0e\u5b57\u4f53',
            patternProductionConstraints: '\u56fe\u6848\u4e0e\u751f\u4ea7\u7ea6\u675f',
            negativeConstraints: '\u8d1f\u9762\u7ea6\u675f',
            copy: '\u590d\u5236',
            copied: '\u5df2\u590d\u5236',
            copyPrompt: '\u590d\u5236 Prompt',
            copyNegativePrompt: '\u590d\u5236 Negative',
            copyStructuredPrompt: '\u590d\u5236\u7ed3\u6784\u63cf\u8ff0',
            copyPackage: '\u590d\u5236\u5b8c\u6574\u5305',
            generateDraft: '\u751f\u6210\u8349\u7a3f',
            draftSubmitting: '\u63d0\u4ea4\u4e2d...',
            draftQueued: '\u5df2\u6392\u961f',
            draftRunning: '\u751f\u6210\u4e2d',
            draftCompleted: '\u8349\u7a3f\u5df2\u751f\u6210',
            draftFailed: '\u8349\u7a3f\u751f\u6210\u5931\u8d25',
            draftMissingPrompt: '\u7f3a\u5c11 prompt',
            draftStatus: '\u8349\u7a3f\u72b6\u6001',
            draftResult: '\u751f\u6210\u7ed3\u679c',
            openDraftResult: '\u6253\u5f00\u7ed3\u679c',
            draftCanvasSoon: '\u5df2\u751f\u6210\uff0c\u540e\u7eed\u53ef\u6dfb\u52a0\u5230\u753b\u5e03',
            taskCountMatched: '\u65b9\u5411\u6570\u91cf\u5df2\u5339\u914d\u9879\u76ee\u9700\u6c42\u3002',
            taskCountShort: '\u5f53\u524d\u9879\u76ee\u9700\u6c42\u8d85\u8fc7\u5355\u6279\u4e0a\u9650\uff0c\u672c\u6b21\u4ec5\u51c6\u5907\u7b2c\u4e00\u6279\u8bbe\u8ba1\u65b9\u5411\u3002',
            plannedDirections: '\u8ba1\u5212\u751f\u6210\u65b9\u5411',
            returnedDirections: '\u5f53\u524d\u8fd4\u56de',
            maxDirectionsPerBatch: '\u5355\u6279\u4e0a\u9650',
            batch: '\u6279\u6b21',
            remainingDirections: '\u5269\u4f59\u65b9\u5411',
            missingReferences: '\u6b64\u4efb\u52a1\u6807\u8bb0\u9700\u8981\u53c2\u8003\u8d44\u6599\uff0c\u4f46\u5f53\u524d\u9879\u76ee\u672a\u8fd4\u56de\u53ef\u7528\u53c2\u8003\u56fe/\u94fe\u63a5\u3002',
            yes: '\u662f',
            no: '\u5426',
        }
        : {
            designStrategy: 'Design Strategy',
            designTasks: 'Design Tasks',
            theme: 'Theme',
            visualDirection: 'Visual Direction',
            targetUser: 'Target User',
            usageScenario: 'Usage Scenario',
            colorPalette: 'Color Palette',
            composition: 'Composition',
            styleKeywords: 'Style Keywords',
            craftNotes: 'Material / Craft Notes',
            avoid: 'Avoid',
            targetSize: 'Target Size',
            purpose: 'Purpose',
            modelRecommendation: 'Model',
            alternativeModelRecommendation: 'Alternative Model',
            modelReason: 'Model Reason',
            draftModel: 'Draft Model',
            modelMappedNotice: 'Mapped an older model ID to an available T8 model.',
            defaultModelNotice: 'Unrecognized model recommendation. Using the default pattern draft model: T8 Nano Banana 3.1 Flash.',
            referenceRequired: 'Reference Required',
            negativePrompt: 'Negative Prompt',
            notes: 'Notes',
            readiness: 'Readiness',
            references: 'References',
            referenceImages: 'Reference Images',
            referenceLinks: 'Reference Links',
            noReferences: 'This project did not return reference images or links.',
            openImageReference: 'Open Reference Image',
            openReference: 'Open Link',
            addToCanvasSoon: 'Add to Canvas (soon)',
            referenceUnavailable: 'Cannot display directly yet: company image access rules are required.',
            referenceIds: 'Reference IDs',
            referenceUsage: 'Reference Usage',
            structuredPromptDescription: 'Structured Prompt Description',
            coreSubjectAndTheme: 'Core Subject & Theme',
            productContextAndUsage: 'Product Context & Usage',
            artStyleAndMedium: 'Art Style & Medium',
            colorPaletteAndMood: 'Color Palette & Mood',
            compositionAndLayout: 'Composition & Layout',
            detailedVisualElements: 'Detailed Visual Elements',
            mainFocus: 'Main Focus',
            backgroundAtmosphere: 'Background & Atmosphere',
            foregroundFraming: 'Foreground & Framing',
            specificDetailsProps: 'Specific Details/Props',
            textAndTypography: 'Text & Typography',
            patternProductionConstraints: 'Pattern / Production Constraints',
            negativeConstraints: 'Negative Constraints',
            copy: 'Copy',
            copied: 'Copied',
            copyPrompt: 'Copy Prompt',
            copyNegativePrompt: 'Copy Negative',
            copyStructuredPrompt: 'Copy Structure',
            copyPackage: 'Copy Package',
            generateDraft: 'Generate Draft',
            draftSubmitting: 'Submitting...',
            draftQueued: 'Queued',
            draftRunning: 'Generating',
            draftCompleted: 'Draft generated',
            draftFailed: 'Draft generation failed',
            draftMissingPrompt: 'Missing prompt',
            draftStatus: 'Draft status',
            draftResult: 'Result',
            openDraftResult: 'Open result',
            draftCanvasSoon: 'Generated. Adding to canvas can come later.',
            taskCountMatched: 'Direction count matches the project requirement.',
            taskCountShort: 'Project demand exceeds the single-batch limit. This run prepares the first batch only.',
            plannedDirections: 'Planned directions',
            returnedDirections: 'Returned',
            maxDirectionsPerBatch: 'Batch limit',
            batch: 'Batch',
            remainingDirections: 'Remaining',
            missingReferences: 'This task requires references, but the project did not return usable reference images or links.',
            yes: 'Yes',
            no: 'No',
        };
    const rows = ([
        [text.code, getProjectField(project, ['code']) || hermesRun.projectCode],
        [fieldText.name, getProjectField(project, ['name', 'projectName'])],
        [text.customer, getProjectField(project, ['customer', 'customerName'])],
        [text.category, getProjectField(project, ['category'])],
        [text.craft, getProjectField(project, ['craft'])],
        [text.size, getProjectField(project, ['sizeRequirement'])],
        [text.quantity, getProjectField(project, ['quantityRequirement'])],
        [fieldText.deadline, getProjectField(project, ['deadline'])],
        [fieldText.requirement, getProjectField(project, ['developmentRequirement', 'brief', 'objective'])],
    ] as [string, unknown][]).filter(([, value]) => !isEmptyProjectValue(value));
    const allProjectFields = Object.entries(project);
    const designStrategyRows = ([
        [proposalText.theme, designStrategy.theme],
        [proposalText.visualDirection, designStrategy.visualDirection],
        [proposalText.targetUser, designStrategy.targetUser],
        [proposalText.usageScenario, designStrategy.usageScenario],
        [proposalText.composition, designStrategy.composition],
    ] as [string, unknown][]).filter(([, value]) => !isEmptyProjectValue(value));
    const colorPalette = getHermesStringList(designStrategy.colorPalette);
    const styleKeywords = getHermesStringList(designStrategy.styleKeywords);
    const craftNotes = getHermesStringList(designStrategy.materialAndCraftNotes);
    const avoidItems = getHermesStringList(designStrategy.avoid);
    const hasDesignStrategy =
        designStrategyRows.length > 0 ||
        colorPalette.length > 0 ||
        styleKeywords.length > 0 ||
        craftNotes.length > 0 ||
        avoidItems.length > 0;
    const hasDesignTasks = designTasks.length > 0;
    const expectedDesignTaskCount = typeof hermesRun.expectedDesignTaskCount === 'number'
        ? hermesRun.expectedDesignTaskCount
        : null;
    const actualDesignTaskCount = typeof hermesRun.actualDesignTaskCount === 'number'
        ? hermesRun.actualDesignTaskCount
        : (expectedDesignTaskCount !== null ? designTasks.length : null);
    const maxDesignsPerGeneration = typeof hermesRun.maxDesignsPerGeneration === 'number'
        ? hermesRun.maxDesignsPerGeneration
        : null;
    const batchPlan = isRecord(hermesRun.batchPlan) ? hermesRun.batchPlan : null;
    const batchLabel = batchPlan ? safeHermesCopyValue(batchPlan.batchLabel) : '';
    const remainingCount = batchPlan && typeof batchPlan.remainingCount === 'number'
        ? batchPlan.remainingCount
        : null;
    const batchReason = batchPlan ? safeHermesCopyValue(batchPlan.reason) : '';
    const hasTaskCountStatus = expectedDesignTaskCount !== null && actualDesignTaskCount !== null;
    const isTaskCountShort = hasTaskCountStatus && actualDesignTaskCount < expectedDesignTaskCount;

    const renderList = (items: string[]) => (
        <div className="flex flex-wrap gap-1">
            {items.map((item, index) => (
                <span
                    key={`${item}-${index}`}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
                        isDark
                            ? 'border-neutral-800 bg-neutral-950/70 text-neutral-300'
                            : 'border-neutral-200 bg-white/75 text-neutral-700'
                    }`}
                >
                    {item}
                </span>
            ))}
        </div>
    );
    const renderCopyButton = (copyKey: string, label: string, textToCopy: string) => (
        <button
            type="button"
            disabled={!textToCopy.trim()}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleCopyTaskText(copyKey, textToCopy);
            }}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isDark
                    ? 'border-neutral-800 bg-neutral-950/70 text-neutral-300 hover:bg-neutral-900'
                    : 'border-neutral-200 bg-white/80 text-neutral-700 hover:bg-white'
            }`}
        >
            {copiedKey === copyKey ? proposalText.copied : label}
        </button>
    );
    const toggleStructuredPrompt = (taskKey: string) => {
        setExpandedStructuredPrompts(prev => {
            const next = new Set(prev);
            if (next.has(taskKey)) next.delete(taskKey);
            else next.add(taskKey);
            return next;
        });
    };
    const handleCopyTaskText = async (copyKey: string, textToCopy: string) => {
        if (!textToCopy.trim()) return;
        await writeClipboardText(textToCopy);
        setCopiedKey(copyKey);
        if (copyResetTimerRef.current) {
            window.clearTimeout(copyResetTimerRef.current);
        }
        copyResetTimerRef.current = window.setTimeout(() => {
            setCopiedKey(null);
            copyResetTimerRef.current = null;
        }, 1400);
    };
    const getDraftStatusLabel = (status: HermesDraftStatus) => {
        if (status === 'submitting') return proposalText.draftSubmitting;
        if (status === 'queued') return proposalText.draftQueued;
        if (status === 'running' || status === 'polling') return proposalText.draftRunning;
        if (status === 'completed') return proposalText.draftCompleted;
        if (status === 'failed') return proposalText.draftFailed;
        return proposalText.generateDraft;
    };
    const updateDraftState = (taskKey: string, patch: Partial<HermesDraftState>) => {
        setDraftStates(prev => ({
            ...prev,
            [taskKey]: {
                status: 'idle',
                ...(prev[taskKey] || {}),
                ...patch,
            },
        }));
    };
    const handleGenerateDraft = async (task: HermesDesignTask, taskKey: string) => {
        const prompt = safeHermesCopyValue(task.prompt);
        if (!prompt.trim()) return;

        const originalModelRecommendation = safeHermesCopyValue(task.modelRecommendation);
        const imageModel = normalizeHermesDraftImageModel(originalModelRecommendation);
        const projectCode = safeHermesCopyValue(hermesRun.projectCode || getProjectField(project, ['code', 'projectCode']));
        const designTaskId = safeHermesCopyValue(task.taskId || taskKey);
        const nodeId = `hermes-draft-${projectCode || 'project'}-${designTaskId || taskKey}-${Date.now()}`;

        updateDraftState(taskKey, {
            status: 'submitting',
            taskId: undefined,
            resultUrl: null,
            progress: 0,
            errorMessage: null,
        });

        try {
            const createdTask = await createImageTask({
                nodeId,
                prompt,
                imageModel,
                negativePrompt: safeHermesCopyValue(task.negativePrompt),
                source: 'hermes_design_task',
                capability: 'hermes-design-draft',
                projectCode,
                hermesRunId: safeHermesCopyValue(hermesRun.id),
                designTaskId,
                title: safeHermesCopyValue(task.title),
                targetSize: safeHermesCopyValue(task.targetSize),
                referenceIds: getHermesStringList(task.referenceIds),
                referenceUsage: safeHermesCopyValue(task.referenceUsage),
                originalModelRecommendation,
                normalizedModelRecommendation: imageModel,
            });

            updateDraftState(taskKey, {
                status: mapImageTaskStatusToDraftStatus(createdTask.status),
                taskId: createdTask.taskId,
                progress: 0,
                errorMessage: null,
            });

            const completedTask = await waitForImageTaskCompletion(createdTask.taskId, {
                pollIntervalMs: 3000,
                maxWaitMs: 10 * 60 * 1000,
                onTaskUpdate: (taskUpdate) => {
                    updateDraftState(taskKey, {
                        status: mapImageTaskStatusToDraftStatus(taskUpdate.status),
                        taskId: taskUpdate.taskId,
                        progress: taskUpdate.progress ?? null,
                        resultUrl: getTaskResultUrl(taskUpdate),
                        errorMessage: taskUpdate.errorMessage
                            ? getSafeDraftErrorMessage(new Error(taskUpdate.errorMessage), language)
                            : null,
                    });
                },
            });

            if (completedTask.status === 'completed') {
                updateDraftState(taskKey, {
                    status: 'completed',
                    taskId: completedTask.taskId,
                    progress: completedTask.progress ?? 100,
                    resultUrl: getTaskResultUrl(completedTask),
                    errorMessage: null,
                });
            } else {
                updateDraftState(taskKey, {
                    status: 'failed',
                    taskId: completedTask.taskId,
                    progress: completedTask.progress ?? null,
                    errorMessage: getSafeDraftErrorMessage(
                        new Error(completedTask.errorMessage || completedTask.errorType || 'Draft generation failed'),
                        language
                    ),
                });
            }
        } catch (error) {
            updateDraftState(taskKey, {
                status: 'failed',
                progress: null,
                errorMessage: getSafeDraftErrorMessage(error, language),
            });
        }
    };

    useEffect(() => () => {
        if (copyResetTimerRef.current) {
            window.clearTimeout(copyResetTimerRef.current);
        }
    }, []);

    return (
        <div className={`ml-2 mb-4 max-w-[86%] rounded-xl border p-3 text-xs leading-5 ${
            isDark
                ? 'border-[#D8FF00]/20 bg-[#101210] text-neutral-200'
                : 'border-lime-200 bg-lime-50 text-neutral-800'
        }`}>
            <div className="mb-2 flex items-center gap-2">
                <Sparkles size={14} className={isDark ? 'text-[#D8FF00]' : 'text-lime-700'} />
                <span className="font-semibold">{text.title}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] uppercase ${
                    hermesRun.status === 'completed'
                        ? isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                        : isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-700'
                }`}>
                    {hermesRun.status}
                </span>
            </div>

            <div className="space-y-2">
                <div>
                    <div className={`mb-1 font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>{text.fields}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {rows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className={isDark ? 'text-neutral-500' : 'text-neutral-500'}>{label}</span>
                                <span className="min-w-0 truncate">{formatHermesValue(value, {
                                    sensitive: isSensitiveHermesField(String(label)),
                                    compact: true,
                                })}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {allProjectFields.length > 0 && (
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowAllProjectFields(value => !value)}
                            className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-colors ${
                                isDark
                                    ? 'border-neutral-800 bg-neutral-950/60 text-neutral-200 hover:bg-neutral-900'
                                    : 'border-neutral-200 bg-white/70 text-neutral-700 hover:bg-white'
                            }`}
                        >
                            <span>{showAllProjectFields ? fieldText.hideFields : fieldText.allFields}</span>
                            {showAllProjectFields ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>

                        {showAllProjectFields && (
                            <div className={`mt-2 max-h-64 overflow-auto rounded-lg border p-2 ${
                                isDark ? 'border-neutral-800 bg-neutral-950/70' : 'border-neutral-200 bg-white/80'
                            }`}>
                                <div className="space-y-2">
                                    {allProjectFields.map(([key, value]) => {
                                        const sensitive = isSensitiveHermesField(key);
                                        const formattedValue = formatHermesValue(value, { sensitive });
                                        return (
                                            <div key={key} className="grid grid-cols-[minmax(84px,0.42fr)_minmax(0,1fr)] gap-2">
                                                <span className={`break-words text-[10px] ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                                                    {formatHermesFieldLabel(key)}
                                                </span>
                                                <span className={`min-w-0 whitespace-pre-wrap break-words text-[10px] ${
                                                    sensitive
                                                        ? isDark ? 'text-amber-300' : 'text-amber-700'
                                                        : isDark ? 'text-neutral-300' : 'text-neutral-700'
                                                }`}>
                                                    {formattedValue}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className={`rounded-lg border p-2 ${
                    isDark ? 'border-neutral-800 bg-neutral-950/50' : 'border-neutral-200 bg-white/70'
                }`}>
                    <div className={`mb-2 font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                        {proposalText.references}
                    </div>

                    {!hasReferences && (
                        <div className={isDark ? 'text-neutral-500' : 'text-neutral-500'}>
                            {proposalText.noReferences}
                        </div>
                    )}

                    {referenceImages.length > 0 && (
                        <div className="mb-3">
                            <div className="mb-1 text-[10px] font-semibold text-neutral-500">{proposalText.referenceImages}</div>
                            <div className="grid grid-cols-1 gap-2">
                                {referenceImages.map((item, index) => {
                                    const referenceUrl = getReferenceUrl(item);
                                    const rawReferenceValue = item.rawValue || referenceUrl || item.url || item.resolvedUrl || '';
                                    const safeUrl = isSafeHttpReferenceUrl(referenceUrl);
                                    const canOpenImageReference = safeUrl && item.safeToDisplay !== false;
                                    return (
                                        <div
                                            key={item.id || `${rawReferenceValue}-${index}`}
                                            className={`rounded-lg border p-2 ${
                                                isDark ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50/80'
                                            }`}
                                        >
                                            <div className="mb-1 flex items-start gap-2">
                                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
                                                    isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-500' : 'border-neutral-200 bg-white text-neutral-500'
                                                }`}>
                                                    <Paperclip size={14} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className={`truncate font-semibold ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                                                        {formatHermesValue(item.label || item.id || `Reference ${index + 1}`, { compact: true })}
                                                    </div>
                                                    <div className="truncate text-[10px] text-neutral-500">{getReferenceDomain(referenceUrl || rawReferenceValue)}</div>
                                                    <div className="truncate text-[10px] text-neutral-500">
                                                        {formatHermesValue(rawReferenceValue, { compact: true })}
                                                    </div>
                                                    {!canOpenImageReference && (
                                                        <div className={`mt-1 rounded-md px-1.5 py-1 text-[10px] ${
                                                            isDark ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-800'
                                                        }`}>
                                                            {proposalText.referenceUnavailable}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {canOpenImageReference && (
                                                    <a
                                                        href={referenceUrl}
                                                        target="_blank"
                                                        rel="noreferrer noopener"
                                                        className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                                                            isDark
                                                                ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'
                                                                : 'border-neutral-200 text-neutral-700 hover:bg-white'
                                                        }`}
                                                    >
                                                        {proposalText.openImageReference}
                                                    </a>
                                                )}
                                                <button
                                                    type="button"
                                                    disabled
                                                    className={`cursor-not-allowed rounded-md border px-2 py-1 text-[10px] font-semibold opacity-60 ${
                                                        isDark
                                                            ? 'border-neutral-800 text-neutral-500'
                                                            : 'border-neutral-200 text-neutral-500'
                                                    }`}
                                                >
                                                    {proposalText.addToCanvasSoon}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {referenceLinks.length > 0 && (
                        <div>
                            <div className="mb-1 text-[10px] font-semibold text-neutral-500">{proposalText.referenceLinks}</div>
                            <div className="space-y-1.5">
                                {referenceLinks.map((item, index) => {
                                    const referenceUrl = getReferenceUrl(item);
                                    const rawReferenceValue = item.rawValue || referenceUrl || item.url || item.resolvedUrl || '';
                                    const safeUrl = isSafeHttpReferenceUrl(referenceUrl) && item.safeToOpen !== false;
                                    return (
                                        <div
                                            key={item.id || `${rawReferenceValue}-${index}`}
                                            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                                                isDark ? 'border-neutral-800 bg-neutral-950/60' : 'border-neutral-200 bg-neutral-50/80'
                                            }`}
                                        >
                                            <Globe size={13} className="shrink-0 text-neutral-500" />
                                            <div className="min-w-0 flex-1">
                                                <div className={`truncate text-[11px] font-semibold ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                                                    {formatHermesValue(item.label || item.type || item.id || `Link ${index + 1}`, { compact: true })}
                                                </div>
                                                <div className="truncate text-[10px] text-neutral-500">
                                                    {formatHermesValue(item.type || 'product_reference', { compact: true })} / {getReferenceDomain(referenceUrl || rawReferenceValue)}
                                                </div>
                                                {!safeUrl && rawReferenceValue && (
                                                    <div className="truncate text-[10px] text-neutral-500">
                                                        {formatHermesValue(rawReferenceValue, { compact: true })}
                                                    </div>
                                                )}
                                            </div>
                                            {safeUrl && (
                                                <a
                                                    href={referenceUrl}
                                                    target="_blank"
                                                    rel="noreferrer noopener"
                                                    className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                                                        isDark
                                                            ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'
                                                            : 'border-neutral-200 text-neutral-700 hover:bg-white'
                                                    }`}
                                                >
                                                    {proposalText.openReference}
                                                </a>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {referenceNotes.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {referenceNotes.map((note, index) => (
                                <div
                                    key={`${note}-${index}`}
                                    className={`rounded-md border px-2 py-1 text-[10px] ${
                                        isDark
                                            ? 'border-neutral-800 bg-neutral-950/70 text-neutral-400'
                                            : 'border-neutral-200 bg-white/75 text-neutral-600'
                                    }`}
                                >
                                    {note}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {hasDesignStrategy && (
                    <div className={`rounded-lg border p-2 ${
                        isDark ? 'border-neutral-800 bg-neutral-950/50' : 'border-neutral-200 bg-white/70'
                    }`}>
                        <div className={`mb-1 font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                            {proposalText.designStrategy}
                        </div>
                        <div className="space-y-1.5">
                            {designStrategyRows.map(([label, value]) => (
                                <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                    <span className={isDark ? 'text-neutral-500' : 'text-neutral-500'}>{label}</span>
                                    <span className={isDark ? 'text-neutral-300' : 'text-neutral-700'}>
                                        {formatHermesValue(value, { compact: true })}
                                    </span>
                                </div>
                            ))}
                            {colorPalette.length > 0 && (
                                <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                    <span className={isDark ? 'text-neutral-500' : 'text-neutral-500'}>{proposalText.colorPalette}</span>
                                    {renderList(colorPalette)}
                                </div>
                            )}
                            {styleKeywords.length > 0 && (
                                <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                    <span className={isDark ? 'text-neutral-500' : 'text-neutral-500'}>{proposalText.styleKeywords}</span>
                                    {renderList(styleKeywords)}
                                </div>
                            )}
                            {craftNotes.length > 0 && (
                                <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                    <span className={isDark ? 'text-neutral-500' : 'text-neutral-500'}>{proposalText.craftNotes}</span>
                                    {renderList(craftNotes)}
                                </div>
                            )}
                            {avoidItems.length > 0 && (
                                <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                                    <span className={isDark ? 'text-neutral-500' : 'text-neutral-500'}>{proposalText.avoid}</span>
                                    {renderList(avoidItems)}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {hasDesignTasks && (
                    <div>
                        <div className={`mb-2 font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                            {proposalText.designTasks}
                        </div>
                        {hasTaskCountStatus && (
                            <div className={`mb-2 rounded-lg border px-2 py-1.5 text-[11px] ${
                                isTaskCountShort
                                    ? isDark
                                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                                        : 'border-amber-200 bg-amber-50 text-amber-800'
                                    : isDark
                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            }`}>
                                <div>
                                    {proposalText.plannedDirections}: {expectedDesignTaskCount}, {proposalText.returnedDirections}: {actualDesignTaskCount}
                                </div>
                                {maxDesignsPerGeneration !== null && (
                                    <div>{proposalText.maxDirectionsPerBatch}: {maxDesignsPerGeneration}</div>
                                )}
                                {batchLabel && <div>{proposalText.batch}: {formatHermesValue(batchLabel)}</div>}
                                {remainingCount !== null && (
                                    <div>{proposalText.remainingDirections}: {remainingCount}</div>
                                )}
                                <div>{isTaskCountShort ? proposalText.taskCountShort : proposalText.taskCountMatched}</div>
                                {hermesRun.countReason && <div>{formatHermesValue(hermesRun.countReason)}</div>}
                                {batchReason && <div>{formatHermesValue(batchReason)}</div>}
                            </div>
                        )}
                        <div className="space-y-2">
                            {designTasks.map((task, index) => {
                                const taskKey = task.taskId || `${task.title || 'task'}-${index}`;
                                const notes = getHermesStringList(task.notes);
                                const referenceIds = getHermesStringList(task.referenceIds);
                                const needsReferences = Boolean(task.referenceRequired);
                                const structuredPrompt = isRecord(task.structuredPromptDescription) ? task.structuredPromptDescription : null;
                                const structuredDetails = structuredPrompt && isRecord(structuredPrompt.detailedVisualElements)
                                    ? structuredPrompt.detailedVisualElements
                                    : {};
                                const structuredRows = structuredPrompt ? ([
                                    [proposalText.coreSubjectAndTheme, structuredPrompt.coreSubjectAndTheme],
                                    [proposalText.productContextAndUsage, structuredPrompt.productContextAndUsage],
                                    [proposalText.artStyleAndMedium, structuredPrompt.artStyleAndMedium],
                                    [proposalText.colorPaletteAndMood, structuredPrompt.colorPaletteAndMood],
                                    [proposalText.compositionAndLayout, structuredPrompt.compositionAndLayout],
                                    [proposalText.textAndTypography, structuredPrompt.textAndTypography],
                                    [proposalText.patternProductionConstraints, structuredPrompt.patternProductionConstraints],
                                    [proposalText.referenceUsage, structuredPrompt.referenceUsage],
                                    [proposalText.negativeConstraints, structuredPrompt.negativeConstraints],
                                ] as [string, unknown][]).filter(([, value]) => !isEmptyProjectValue(value)) : [];
                                const structuredDetailRows = structuredPrompt ? ([
                                    [proposalText.mainFocus, structuredDetails.mainFocus],
                                    [proposalText.backgroundAtmosphere, structuredDetails.backgroundAtmosphere],
                                    [proposalText.foregroundFraming, structuredDetails.foregroundFraming],
                                    [proposalText.specificDetailsProps, structuredDetails.specificDetailsProps],
                                ] as [string, unknown][]).filter(([, value]) => !isEmptyProjectValue(value)) : [];
                                const isStructuredPromptExpanded = expandedStructuredPrompts.has(taskKey);
                                const finalPromptText = safeHermesCopyValue(task.prompt);
                                const negativePromptText = safeHermesCopyValue(task.negativePrompt);
                                const structuredPromptMarkdown = structuredPrompt ? buildStructuredPromptMarkdown(task) : '';
                                const generationPackage = buildTaskGenerationPackage(task);
                                const originalModelRecommendation = safeHermesCopyValue(task.modelRecommendation);
                                const draftModelNormalization = getHermesDraftModelNormalization(originalModelRecommendation);
                                const normalizedDraftModel = draftModelNormalization.model;
                                const isLegacyModelMapped = draftModelNormalization.reason === 'legacy';
                                const isDefaultModelUsed = draftModelNormalization.reason === 'default';
                                const draftState = draftStates[taskKey] || { status: 'idle' as HermesDraftStatus };
                                const isDraftBusy = draftState.status === 'submitting' ||
                                    draftState.status === 'queued' ||
                                    draftState.status === 'running' ||
                                    draftState.status === 'polling';
                                const canGenerateDraft = Boolean(finalPromptText.trim()) && !isDraftBusy;
                                return (
                                    <div
                                        key={taskKey}
                                        className={`rounded-lg border p-2 ${
                                            isDark ? 'border-neutral-800 bg-neutral-950/50' : 'border-neutral-200 bg-white/70'
                                        }`}
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className={`font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                                                {task.title || task.taskId || `Concept ${index + 1}`}
                                            </span>
                                            {task.taskId && <span className="text-[10px] text-neutral-500">{task.taskId}</span>}
                                        </div>
                                        <div className="mb-2 flex flex-wrap gap-1">
                                            {renderCopyButton(`${taskKey}:package`, proposalText.copyPackage, generationPackage)}
                                            {renderCopyButton(`${taskKey}:prompt`, proposalText.copyPrompt, finalPromptText)}
                                            {renderCopyButton(`${taskKey}:negative`, proposalText.copyNegativePrompt, negativePromptText)}
                                            {structuredPrompt && renderCopyButton(
                                                `${taskKey}:structured`,
                                                proposalText.copyStructuredPrompt,
                                                structuredPromptMarkdown
                                            )}
                                            <button
                                                type="button"
                                                disabled={!canGenerateDraft}
                                                title={!finalPromptText.trim() ? proposalText.draftMissingPrompt : proposalText.generateDraft}
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    void handleGenerateDraft(task, taskKey);
                                                }}
                                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                                    isDark
                                                        ? 'border-[#D8FF00]/35 bg-[#D8FF00]/10 text-[#D8FF00] hover:bg-[#D8FF00]/15'
                                                        : 'border-lime-300 bg-lime-50 text-lime-800 hover:bg-lime-100'
                                                }`}
                                            >
                                                {isDraftBusy && <Loader2 size={11} className="animate-spin" />}
                                                {isDraftBusy ? getDraftStatusLabel(draftState.status) : proposalText.generateDraft}
                                            </button>
                                        </div>
                                        {draftState.status !== 'idle' && (
                                            <div className={`mb-2 rounded-md border px-2 py-1.5 text-[10px] ${
                                                draftState.status === 'failed'
                                                    ? isDark
                                                        ? 'border-rose-500/20 bg-rose-500/10 text-rose-200'
                                                        : 'border-rose-200 bg-rose-50 text-rose-800'
                                                    : draftState.status === 'completed'
                                                        ? isDark
                                                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                                                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                                        : isDark
                                                            ? 'border-sky-500/20 bg-sky-500/10 text-sky-200'
                                                            : 'border-sky-200 bg-sky-50 text-sky-800'
                                            }`}>
                                                <div>
                                                    <span className="font-semibold">{proposalText.draftStatus}: </span>
                                                    {getDraftStatusLabel(draftState.status)}
                                                    {typeof draftState.progress === 'number' && draftState.progress > 0 && (
                                                        <span> · {Math.round(draftState.progress)}%</span>
                                                    )}
                                                </div>
                                                {draftState.taskId && (
                                                    <div className="break-all text-neutral-500">task: {draftState.taskId}</div>
                                                )}
                                                {draftState.status === 'completed' && draftState.resultUrl && (
                                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                                        <span>{proposalText.draftResult}</span>
                                                        <a
                                                            href={draftState.resultUrl}
                                                            target="_blank"
                                                            rel="noreferrer noopener"
                                                            className="font-semibold underline underline-offset-2"
                                                            onClick={(event) => event.stopPropagation()}
                                                        >
                                                            {proposalText.openDraftResult}
                                                        </a>
                                                        <span className="text-neutral-500">{proposalText.draftCanvasSoon}</span>
                                                    </div>
                                                )}
                                                {draftState.status === 'failed' && draftState.errorMessage && (
                                                    <div className="mt-1 whitespace-pre-wrap break-words">
                                                        {draftState.errorMessage}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                                            {task.targetSize && (
                                                <>
                                                    <span className="text-neutral-500">{proposalText.targetSize}</span>
                                                    <span>{formatHermesValue(task.targetSize, { compact: true })}</span>
                                                </>
                                            )}
                                            {task.purpose && (
                                                <>
                                                    <span className="text-neutral-500">{proposalText.purpose}</span>
                                                    <span>{formatHermesValue(task.purpose, { compact: true })}</span>
                                                </>
                                            )}
                                            {task.modelRecommendation && (
                                                <>
                                                    <span className="text-neutral-500">{proposalText.modelRecommendation}</span>
                                                    <span>{formatHermesValue(task.modelRecommendation, { compact: true })}</span>
                                                </>
                                            )}
                                            {task.alternativeModelRecommendation && (
                                                <>
                                                    <span className="text-neutral-500">{proposalText.alternativeModelRecommendation}</span>
                                                    <span>{formatHermesValue(task.alternativeModelRecommendation, { compact: true })}</span>
                                                </>
                                            )}
                                            {task.modelReason && (
                                                <>
                                                    <span className="text-neutral-500">{proposalText.modelReason}</span>
                                                    <span>{formatHermesValue(task.modelReason, { compact: true })}</span>
                                                </>
                                            )}
                                            <span className="text-neutral-500">{proposalText.draftModel}</span>
                                            <span>{formatHermesValue(normalizedDraftModel, { compact: true })}</span>
                                            <span className="text-neutral-500">{proposalText.referenceRequired}</span>
                                            <span>{task.referenceRequired ? proposalText.yes : proposalText.no}</span>
                                        </div>
                                        {(isLegacyModelMapped || isDefaultModelUsed) && (
                                            <div className={`mb-2 rounded-md border px-2 py-1.5 text-[10px] ${
                                                isDark
                                                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                                            }`}>
                                                {isLegacyModelMapped ? proposalText.modelMappedNotice : proposalText.defaultModelNotice}
                                            </div>
                                        )}
                                        {referenceIds.length > 0 && (
                                            <div className="mb-2">
                                                <div className="mb-1 text-[10px] font-semibold text-neutral-500">{proposalText.referenceIds}</div>
                                                {renderList(referenceIds)}
                                            </div>
                                        )}
                                        {task.referenceUsage && (
                                            <div className="mb-2">
                                                <div className="mb-1 text-[10px] font-semibold text-neutral-500">{proposalText.referenceUsage}</div>
                                                <p className={`whitespace-pre-wrap break-words rounded-md p-2 text-[11px] ${
                                                    isDark ? 'bg-neutral-900/70 text-neutral-400' : 'bg-neutral-50 text-neutral-600'
                                                }`}>
                                                    {formatHermesValue(task.referenceUsage)}
                                                </p>
                                            </div>
                                        )}
                                        {needsReferences && !hasReferences && (
                                            <div className={`mb-2 rounded-md border px-2 py-1.5 text-[10px] ${
                                                isDark
                                                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                                            }`}>
                                                {proposalText.missingReferences}
                                            </div>
                                        )}
                                        {structuredPrompt && (
                                            <div className="mb-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleStructuredPrompt(taskKey)}
                                                    className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-[10px] font-semibold transition-colors ${
                                                        isDark
                                                            ? 'border-neutral-800 bg-neutral-950/70 text-neutral-300 hover:bg-neutral-900'
                                                            : 'border-neutral-200 bg-white/80 text-neutral-700 hover:bg-white'
                                                    }`}
                                                >
                                                    <span>{proposalText.structuredPromptDescription}</span>
                                                    {isStructuredPromptExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                </button>
                                                {isStructuredPromptExpanded && (
                                                    <div className={`mt-1.5 space-y-1.5 rounded-md border p-2 ${
                                                        isDark ? 'border-neutral-800 bg-neutral-950/50' : 'border-neutral-200 bg-neutral-50/80'
                                                    }`}>
                                                        {structuredRows.map(([label, value]) => (
                                                            <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                                                                <span className="text-[10px] text-neutral-500">{label}</span>
                                                                <span className={`whitespace-pre-wrap break-words text-[10px] ${
                                                                    isDark ? 'text-neutral-300' : 'text-neutral-700'
                                                                }`}>
                                                                    {formatHermesValue(value)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {structuredDetailRows.length > 0 && (
                                                            <div>
                                                                <div className="mb-1 text-[10px] font-semibold text-neutral-500">
                                                                    {proposalText.detailedVisualElements}
                                                                </div>
                                                                <div className="space-y-1">
                                                                    {structuredDetailRows.map(([label, value]) => (
                                                                        <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                                                                            <span className="text-[10px] text-neutral-500">{label}</span>
                                                                            <span className={`whitespace-pre-wrap break-words text-[10px] ${
                                                                                isDark ? 'text-neutral-300' : 'text-neutral-700'
                                                                            }`}>
                                                                                {formatHermesValue(value)}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {task.prompt && (
                                            <div className="mb-2">
                                                <div className="mb-1 text-[10px] font-semibold text-neutral-500">Prompt</div>
                                                <p className={`whitespace-pre-wrap break-words rounded-md p-2 text-[11px] ${
                                                    isDark ? 'bg-neutral-900/80 text-neutral-300' : 'bg-neutral-50 text-neutral-700'
                                                }`}>
                                                    {formatHermesValue(task.prompt)}
                                                </p>
                                            </div>
                                        )}
                                        {task.negativePrompt && (
                                            <div className="mb-2">
                                                <div className="mb-1 text-[10px] font-semibold text-neutral-500">{proposalText.negativePrompt}</div>
                                                <p className={`whitespace-pre-wrap break-words rounded-md p-2 text-[11px] ${
                                                    isDark ? 'bg-neutral-900/70 text-neutral-400' : 'bg-neutral-50 text-neutral-600'
                                                }`}>
                                                    {formatHermesValue(task.negativePrompt)}
                                                </p>
                                            </div>
                                        )}
                                        {notes.length > 0 && (
                                            <div>
                                                <div className="mb-1 text-[10px] font-semibold text-neutral-500">{proposalText.notes}</div>
                                                {renderList(notes)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {generationReadiness?.reason && (
                    <div className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                        isDark
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}>
                        <span className="font-semibold">{proposalText.readiness}: </span>
                        {formatHermesValue(generationReadiness.reason)}
                    </div>
                )}

                <div>
                    <div className={`mb-1 font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>{text.strategy}</div>
                    <div className={isDark ? 'text-neutral-300' : 'text-neutral-700'}>
                        <div>{text.model}: {strategy.selectedModel || '-'}</div>
                        <div>{text.mode}: {strategy.mode || '-'}</div>
                        {strategy.reason && <div>{text.reason}: {strategy.reason}</div>}
                    </div>
                </div>

                {designTask.prompt && (
                    <div>
                        <div className={`mb-1 font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>{text.prompt}</div>
                        <p className={`line-clamp-4 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>{designTask.prompt}</p>
                    </div>
                )}

                {assets.length > 0 && (
                    <div>
                        <div className={`mb-2 font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>{text.assets}</div>
                        <div className="grid grid-cols-2 gap-2">
                            {assets.map(asset => (
                                <div key={asset.id} className={`overflow-hidden rounded-lg border ${
                                    isDark ? 'border-neutral-800 bg-neutral-950' : 'border-neutral-200 bg-white'
                                }`}>
                                    {asset.url ? (
                                        <img src={asset.url} alt={asset.imageId || text.placeholder} className="h-24 w-full object-cover" />
                                    ) : (
                                        <div className={`flex h-24 items-center justify-center px-2 text-center ${
                                            isDark ? 'text-neutral-500' : 'text-neutral-500'
                                        }`}>
                                            {text.placeholder}
                                        </div>
                                    )}
                                    <div className="truncate px-2 py-1 text-[10px] text-neutral-500">
                                        {asset.imageId || asset.model || text.placeholder}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const HermesCanvasSummaryCard: React.FC<{
    hermesRun: HermesRunPayload;
    canvasTheme: 'dark' | 'light';
    language: Language;
}> = ({ hermesRun, canvasTheme, language }) => {
    const [showDetails, setShowDetails] = useState(false);
    const isDark = canvasTheme === 'dark';
    const project = isRecord(hermesRun.project) ? hermesRun.project : {};
    const projectCode = hermesRun.projectCode || safeHermesCopyValue(getProjectField(project, ['code', 'projectCode']));
    const projectName = safeHermesCopyValue(getProjectField(project, ['name', 'projectName']));
    const summaryText = language === 'zh'
        ? {
            title: '\u5df2\u6dfb\u52a0\u5230\u753b\u5e03',
            message: '\u5df2\u5728\u753b\u5e03\u4e2d\u521b\u5efa Hermes \u9879\u76ee\u5361\u7247',
            details: '\u67e5\u770b\u8be6\u60c5',
            hideDetails: '\u6536\u8d77\u8be6\u60c5',
        }
        : {
            title: 'Added to canvas',
            message: 'Created a Hermes project card on the canvas',
            details: 'View details',
            hideDetails: 'Hide details',
        };

    return (
        <div className="mb-4">
            <div className={`rounded-xl border p-3 text-sm ${
                isDark
                    ? 'border-[#D8FF00]/25 bg-[#D8FF00]/10 text-neutral-200'
                    : 'border-lime-300 bg-lime-50 text-neutral-800'
            }`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className={`text-xs font-semibold uppercase tracking-[0.08em] ${isDark ? 'text-[#D8FF00]' : 'text-lime-700'}`}>
                            {summaryText.title}
                        </div>
                        <div className="mt-1 font-semibold leading-5">
                            {summaryText.message}{projectCode ? `: ${projectCode}` : ''}
                        </div>
                        {projectName && (
                            <div className={`mt-0.5 truncate text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                                {projectName}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowDetails(prev => !prev)}
                        className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                            isDark
                                ? 'border-neutral-800 bg-neutral-950/60 text-neutral-300 hover:bg-neutral-900'
                                : 'border-neutral-200 bg-white/80 text-neutral-700 hover:bg-white'
                        }`}
                    >
                        {showDetails ? summaryText.hideDetails : summaryText.details}
                    </button>
                </div>
            </div>

            {showDetails && (
                <HermesResultCard
                    hermesRun={hermesRun}
                    canvasTheme={canvasTheme}
                    language={language}
                />
            )}
        </div>
    );
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ChatPanel: React.FC<ChatPanelProps> = ({
    isOpen,
    onClose,
    userName = 'Creator',
    isDraggingNode = false,
    canvasTheme = 'dark',
    language = 'zh',
    getCanvasContext,
    onHermesRunReceived,
}) => {
    // --- State ---
    const [message, setMessage] = useState('');
    const [showTip, setShowTip] = useState(true);
    const [attachedMedia, setAttachedMedia] = useState<AttachedMedia[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [mediaError, setMediaError] = useState<string | null>(null);

    // Theme helper
    const isDark = canvasTheme === 'dark';

    // Chat agent hook
    const {
        messages,
        topic,
        isLoading,
        error,
        sessions,
        isLoadingSessions,
        sendMessage,
        startNewChat,
        loadSession,
        deleteSession,
        hasMessages,
    } = useChatAgent({ onHermesRunReceived });

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // --- Effects ---

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // --- Event Handlers ---

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();

        // Only set false if leaving the panel entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragOver(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        setMediaError(null);

        // Get data from drag event
        const nodeData = e.dataTransfer.getData('application/json');

        if (nodeData) {
            try {
                const { nodeId, url, type } = JSON.parse(nodeData);

                if (url && (type === 'image' || type === 'video')) {
                    // Convert URL to base64 for API consumption
                    let base64Data: string | undefined;

                    if (type === 'image') {
                        try {
                            const response = await fetch(url);
                            const blob = await response.blob();

                            if (blob.size > CHAT_ATTACHMENT_MAX_BYTES) {
                                setMediaError(getMediaTooLargeMessage(language));
                                return;
                            }

                            base64Data = await new Promise<string>((resolve, reject) => {
                                const reader = new FileReader();

                                reader.onloadend = () => {
                                    const result = reader.result as string;
                                    const base64 = result.split(',')[1];
                                    resolve(base64);
                                };

                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });
                        } catch (err) {
                            console.error('Failed to convert image to base64:', err);
                        }
                    }

                    // Add to attachments if not already present
                    setAttachedMedia(prev => {
                        if (prev.some(m => m.nodeId === nodeId)) return prev;
                        return [...prev, { type, url, nodeId, base64: base64Data }];
                    });
                }
            } catch (err) {
                console.error('Failed to parse dropped node data:', err);
            }
        }
    };

    const removeAttachment = (nodeId: string) => {
        setAttachedMedia(prev => prev.filter(m => m.nodeId !== nodeId));
    };

    const handleSend = async () => {
        if ((!message.trim() && attachedMedia.length === 0) || isLoading) return;

        const currentMessage = message;
        const currentMedia = attachedMedia;

        const hasOversizedMedia = currentMedia.some(media =>
            media.base64 && estimateBase64Bytes(media.base64) > CHAT_ATTACHMENT_MAX_BYTES
        );

        if (hasOversizedMedia) {
            setMediaError(getMediaTooLargeMessage(language));
            return;
        }

        // Clear input immediately for better UX
        setMessage('');
        setAttachedMedia([]);
        setMediaError(null);

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Hide tip after first message
        if (showTip) {
            setShowTip(false);
        }

        await sendMessage(
            currentMessage,
            currentMedia.length > 0
                ? currentMedia.map(m => ({
                    type: m.type,
                    url: m.url,
                    base64: m.base64,
                }))
                : undefined,
            getCanvasContext?.(currentMessage)
        );
    };

    const handleNewChat = () => {
        startNewChat();
        setMessage('');
        setAttachedMedia([]);
        setMediaError(null);
        setShowTip(true);
        setShowHistory(false);
    };

    const handleLoadSession = async (sessionId: string) => {
        await loadSession(sessionId);
        setShowHistory(false);
        setShowTip(false);
    };

    const handleSessionKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void handleLoadSession(sessionId);
        }
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        await deleteSession(sessionId);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        if (diffDays === 1) {
            return t(language, 'yesterday');
        }

        if (diffDays < 7) {
            return language === 'zh' ? `${diffDays} ${t(language, 'daysAgo')}` : `${diffDays} ${t(language, 'daysAgo')}`;
        }

        return date.toLocaleDateString();
    };

    // --- Render ---

    if (!isOpen) return null;

    const showHighlight = isDraggingNode || isDragOver;

    const accentText = isDark ? 'text-[#D8FF00]' : 'text-lime-600';
    const accentBgSoft = isDark ? 'bg-[#D8FF00]/10' : 'bg-lime-100/70';
    const accentButton = isDark
        ? 'bg-[#D8FF00] hover:bg-[#C8EE00] text-black shadow-[0_0_8px_rgba(216,255,0,0.12)]'
        : 'bg-lime-500 hover:bg-lime-400 text-white shadow-[0_6px_16px_rgba(132,204,22,0.16)]';

    const iconButtonClass = isDark
        ? 'hover:bg-[#1A1D1A] text-neutral-400 hover:text-neutral-100 transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35'
        : 'hover:bg-neutral-100 text-neutral-500 hover:text-lime-600 transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/35';

    const inputIconButtonClass = isDark
        ? 'hover:bg-[#1A1D1A] text-neutral-400 hover:text-neutral-100 transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35'
        : 'hover:bg-neutral-200 text-neutral-500 hover:text-lime-600 transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/35';

    const isSendDisabled = isLoading || (!message.trim() && attachedMedia.length === 0);
    const visibleError = mediaError;
    const hasAssistantErrorMessage = Boolean(
        error && messages.some(msg => msg.role === 'assistant' && msg.content === error)
    );

    return (
        <div
            className={`fixed top-0 right-0 w-[400px] h-full border-l flex flex-col z-[70] shadow-[var(--myml-shadow-panel)] motion-panel-in transition-[background-color,border-color,box-shadow] duration-[var(--myml-motion-panel)] ${
                showHighlight
                    ? isDark
                        ? 'border-neutral-800 ring-2 ring-[#D8FF00]/40'
                        : 'border-lime-500 ring-2 ring-lime-500/35'
                    : isDark
                        ? 'border-neutral-800'
                        : 'border-neutral-200'
            } ${isDark ? 'bg-[var(--myml-surface-panel)]' : 'bg-white'}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Drag Overlay */}
            {showHighlight && (
                <div className={`absolute inset-0 ${accentBgSoft} pointer-events-none z-10 flex items-center justify-center`}>
                    <div
                        className={`border border-dashed rounded-xl px-8 py-6 text-center ${
                            isDark
                                ? 'bg-[#D8FF00]/10 border-[#D8FF00]/45 shadow-[0_0_10px_rgba(216,255,0,0.08)]'
                                : 'bg-lime-50 border-lime-400 shadow-[0_6px_18px_rgba(132,204,22,0.12)]'
                        }`}
                    >
                        <Sparkles className={`w-8 h-8 mx-auto mb-2 ${accentText}`} />
                        <p className={`${accentText} text-sm font-semibold leading-5`}>{t(language, 'dropMediaHere')}</p>
                    </div>
                </div>
            )}

            {/* History Panel */}
            {showHistory && (
                <div className={`absolute inset-0 z-20 flex flex-col ${isDark ? 'bg-[var(--myml-surface-panel)]' : 'bg-white'}`}>
                    {/* History Header */}
                    <div className={`flex items-center gap-3 px-4 py-3 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                        <button
                            onClick={() => setShowHistory(false)}
                            aria-label={t(language, 'backToChat')}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${iconButtonClass}`}
                        >
                            <ChevronLeft size={18} />
                        </button>

                        <span className={`text-base font-semibold leading-5 ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                            {t(language, 'chatHistory')}
                        </span>
                    </div>

                    {/* History List */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {isLoadingSessions ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className={`w-6 h-6 animate-spin ${accentText}`} />
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className={`text-center py-8 rounded-lg border ${isDark ? 'bg-[#151815] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                                <MessageSquare className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-neutral-600' : 'text-neutral-300'}`} />
                                <p className="text-neutral-500 text-sm font-medium leading-5">{t(language, 'noChatHistory')}</p>
                                <p className={`${isDark ? 'text-neutral-600' : 'text-neutral-400'} mt-1 text-[11px] leading-4`}>
                                    {t(language, 'startConversationHint')}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {sessions.map((session: ChatSession) => (
                                    <div
                                        key={session.id}
                                        onClick={() => handleLoadSession(session.id)}
                                        onKeyDown={(e) => handleSessionKeyDown(e, session.id)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`${t(language, 'openChat')}: ${session.topic}`}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-[background-color,border-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 group cursor-pointer ${
                                            isDark
                                                ? 'bg-[var(--myml-surface-raised)] hover:bg-[var(--myml-surface-hover)] border border-[var(--myml-border-default)] hover:border-[var(--myml-border-active)]'
                                                : 'bg-neutral-100 hover:bg-lime-50 border border-transparent hover:border-lime-200'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-semibold leading-5 truncate ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                                                    {session.topic}
                                                </p>
                                                <p className={`mt-0.5 text-[11px] leading-4 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                                                    {session.messageCount} {t(language, 'messages')} 路 {formatDate(session.updatedAt || session.createdAt)}
                                                </p>
                                            </div>

                                            <button
                                                onClick={(e) => handleDeleteSession(e, session.id)}
                                                aria-label={`${t(language, 'deleteChat')}: ${session.topic}`}
                                                className="flex h-7 w-7 items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-md transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 text-neutral-500 hover:text-red-400"
                                                title={t(language, 'deleteChat')}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* New Chat Button */}
                    <div className={`p-4 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                        <button
                            onClick={handleNewChat}
                            aria-label={t(language, 'newChat')}
                            className={`flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${accentButton}`}
                        >
                            <Plus size={16} />
                            {t(language, 'newChat')}
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-neutral-800 bg-[#101210]' : 'border-neutral-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                    <span className={`text-base font-semibold leading-5 truncate max-w-[180px] ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                        {topic || (hasMessages ? t(language, 'newChat') : t(language, 'imageIdeas'))}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {hasMessages && (
                        <button
                            onClick={handleNewChat}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconButtonClass}`}
                            aria-label={t(language, 'newChat')}
                            title={t(language, 'newChat')}
                        >
                            <Plus size={18} />
                        </button>
                    )}

                    <button
                        onClick={() => setShowHistory(true)}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconButtonClass}`}
                        aria-label={t(language, 'chatHistory')}
                        aria-pressed={showHistory}
                        title={t(language, 'chatHistory')}
                    >
                        <History size={18} />
                    </button>

                    <button
                        onClick={onClose}
                        aria-label={t(language, 'closeChat')}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconButtonClass}`}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className={`flex-1 overflow-y-auto p-4 ${isDark ? 'bg-[#101210]' : 'bg-white'}`}>
                {!hasMessages ? (
                    <>
                        {/* Greeting */}
                        <h1 className={`text-base font-semibold leading-5 mb-1 ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`}>
                            {t(language, 'greetingPrefix')}, {userName}
                        </h1>

                        <p className={`${isDark ? 'text-neutral-500' : 'text-neutral-600'} text-sm leading-5 mb-4`}>
                            {t(language, 'inspirationPrompt')}
                        </p>

                        {/* Tip Card */}
                        {showTip && (
                            <div
                                className={`rounded-lg p-3 mb-4 border ${
                                    isDark
                                        ? 'bg-[#151815] border-neutral-800'
                                        : 'bg-neutral-50 border-neutral-200'
                                }`}
                            >
                                <div
                                    className={`rounded-lg overflow-hidden mb-3 flex items-center justify-center ${
                                        isDark ? 'bg-[#1A1D1A]' : 'bg-neutral-100'
                                    }`}
                                >
                                    <img
                                        src="/chat-preview.gif"
                                        alt={t(language, 'dragDropPreview')}
                                        className="w-full h-auto object-cover rounded-lg"
                                    />
                                </div>

                                <p className={`text-[13px] leading-5 mb-3 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                                    {t(language, 'dropNodeHint')}
                                </p>

                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setShowTip(false)}
                                        aria-label={t(language, 'dismissChatTip')}
                                        className={`h-8 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                                            isDark
                                                ? 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
                                                : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-900'
                                        }`}
                                    >
                                        {t(language, 'gotIt')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="space-y-1">
                        {messages.map((msg: ChatMessageType) => (
                            <React.Fragment key={msg.id}>
                                <ChatMessage
                                    role={msg.role}
                                    content={msg.content}
                                    media={msg.media}
                                    timestamp={msg.timestamp}
                                    canvasTheme={canvasTheme}
                                    language={language}
                                />
                                {msg.role === 'assistant' && msg.hermesRun && (
                                    onHermesRunReceived && !msg.id.startsWith('loaded-') ? (
                                        <HermesCanvasSummaryCard
                                            hermesRun={msg.hermesRun}
                                            canvasTheme={canvasTheme}
                                            language={language}
                                        />
                                    ) : (
                                        <HermesResultCard
                                            hermesRun={msg.hermesRun}
                                            canvasTheme={canvasTheme}
                                            language={language}
                                        />
                                    )
                                )}
                            </React.Fragment>
                        ))}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex justify-start mb-4">
                                <div className={`rounded-xl rounded-bl-md px-4 py-3 ${isDark ? 'bg-[#151815] border border-neutral-800' : 'bg-neutral-100'}`}>
                                    <Loader2 className={`w-5 h-5 animate-spin ${accentText}`} />
                                </div>
                            </div>
                        )}

                        {/* Error message */}
                        {error && !hasAssistantErrorMessage && (
                            <div className="flex justify-center mb-4">
                                <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-2 text-red-400 text-sm">
                                    {error}
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className={`p-4 border-t ${isDark ? 'border-neutral-800 bg-[#101210]' : 'border-neutral-200 bg-white'}`}>
                {visibleError && (
                    <div className="mb-3 rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-2 text-sm leading-5 text-red-400">
                        {visibleError}
                    </div>
                )}

                <div
                    className={`rounded-xl p-3 border ${
                        isDark
                            ? 'bg-[#151815] border-neutral-800 focus-within:border-[#D8FF00]/40 focus-within:shadow-[0_0_8px_rgba(216,255,0,0.05)]'
                            : 'bg-neutral-50 border-neutral-200 focus-within:border-lime-400 focus-within:shadow-[0_6px_18px_rgba(132,204,22,0.08)]'
                    }`}
                >
                    {/* Attached Media Preview */}
                    {attachedMedia.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {attachedMedia.map((media) => (
                                <div key={media.nodeId} className="relative">
                                    {media.type === 'image' ? (
                                        <img
                                            src={media.url}
                                            alt={t(language, 'attachedMedia')}
                                            className={`w-14 h-14 object-cover rounded-lg border ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}
                                        />
                                    ) : (
                                        <video
                                            src={media.url}
                                            className={`w-14 h-14 object-cover rounded-lg border ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}
                                        />
                                    )}

                                    <button
                                        onClick={() => removeAttachment(media.nodeId)}
                                        aria-label={`${t(language, 'removeAttached')} ${media.type}`}
                                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-red-500 text-white transition-[background-color,transform] duration-150 hover:bg-red-400 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                                    >
                                        <X size={10} aria-hidden="true" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={t(language, 'chatPlaceholder')}
                        className={`w-full bg-transparent text-sm leading-5 outline-none mb-3 resize-none min-h-[24px] max-h-[120px] ${
                            isDark
                                ? 'text-white placeholder:text-neutral-500'
                                : 'text-neutral-900 placeholder:text-neutral-400'
                        }`}
                        rows={1}
                        style={{ scrollbarWidth: 'none' }}
                        disabled={isLoading}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';

                            const newHeight = Math.min(target.scrollHeight, 120);
                            target.style.height = newHeight + 'px';
                            target.style.overflowY = target.scrollHeight > 120 ? 'auto' : 'hidden';
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                className={`flex h-7 w-7 items-center justify-center rounded-lg ${inputIconButtonClass}`}
                                aria-label={t(language, 'attachMedia')}
                            >
                                <Paperclip size={16} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                className={`flex h-7 w-7 items-center justify-center rounded-lg ${inputIconButtonClass}`}
                                aria-label={t(language, 'webSearch')}
                            >
                                <Globe size={16} />
                            </button>

                            <button
                                className={`flex h-7 w-7 items-center justify-center rounded-lg ${inputIconButtonClass}`}
                                aria-label={t(language, 'chatSettings')}
                            >
                                <Settings size={16} />
                            </button>

                            <button
                                onClick={handleSend}
                                disabled={isSendDisabled}
                                aria-label={t(language, 'sendMessage')}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color,box-shadow,transform,opacity] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${
                                    isSendDisabled
                                        ? isDark
                                            ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                                            : 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                                        : accentButton
                                }`}
                            >
                                {isLoading ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Send size={14} />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// CHAT BUBBLE
// ============================================================================

interface ChatBubbleProps {
    onClick: () => void;
    isOpen: boolean;
    language?: Language;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ onClick, isOpen, language = 'zh' }) => {
    if (isOpen) return null;

    return (
        <button
            onClick={onClick}
            aria-label={t(language, 'openChat')}
            aria-pressed={isOpen}
            className="fixed bottom-6 right-6 z-[80] flex h-12 w-12 items-center justify-center rounded-xl bg-[#D8FF00] shadow-[0_8px_20px_rgba(216,255,0,0.12)] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[#e4ff3a] hover:shadow-[0_10px_22px_rgba(216,255,0,0.14)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
            <Sparkles size={22} className="text-black" />
        </button>
    );
};
