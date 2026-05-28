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
}

const CHAT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

function getMediaTooLargeMessage(language: Language): string {
    return language === 'zh'
        ? '图片太大，请压缩后再发送。'
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
const SENSITIVE_HERMES_FIELD_PATTERN = /(api_?key|apikey|access_?key|password|passwd|pwd|secret|token|authorization|(^|[_\-\s])auth($|[_\-\s])|cookie|session|phone|mobile|tel|email|id_?card|idcard|身份证|手机号|电话|邮箱|客户联系方式|联系人电话|credential)/i;

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
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
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

    return truncateHermesText(parts.length > 0 ? parts.join(' · ') : formatHermesValue(note, { compact: true }));
}

const HermesResultCard: React.FC<{
    hermesRun: HermesRunPayload;
    canvasTheme: 'dark' | 'light';
    language: Language;
}> = ({ hermesRun, canvasTheme, language }) => {
    const [showAllProjectFields, setShowAllProjectFields] = useState(false);
    const isDark = canvasTheme === 'dark';
    const project = isRecord(hermesRun.project) ? hermesRun.project : {};
    const strategy = hermesRun.strategy || {};
    const designTask = hermesRun.designTask || {};
    const designStrategy = hermesRun.designStrategy || {};
    const designTasks = Array.isArray(hermesRun.designTasks) ? hermesRun.designTasks : [];
    const references = hermesRun.references || {};
    const referenceImages = Array.isArray(references.images)
        ? references.images.filter(item => item?.url)
        : [];
    const referenceLinks = Array.isArray(references.links)
        ? references.links.filter(item => item?.url && item.safeToOpen !== false)
        : [];
    const referenceNotes = Array.isArray(references.notes)
        ? references.notes.map(note => formatReferenceNote(note, language)).filter(Boolean)
        : [];
    const hasReferences = referenceImages.length > 0 || referenceLinks.length > 0;
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
            referenceRequired: '\u9700\u8981\u53c2\u8003\u56fe',
            negativePrompt: 'Negative Prompt',
            notes: '\u5907\u6ce8',
            readiness: '\u6267\u884c\u72b6\u6001',
            references: '\u53c2\u8003\u8d44\u6599',
            referenceImages: '\u53c2\u8003\u56fe',
            referenceLinks: '\u53c2\u8003\u94fe\u63a5',
            noReferences: '\u5f53\u524d\u9879\u76ee\u672a\u8fd4\u56de\u53c2\u8003\u56fe\u6216\u53c2\u8003\u94fe\u63a5',
            openReference: '\u6253\u5f00\u94fe\u63a5',
            addToCanvasSoon: '\u6dfb\u52a0\u5230\u753b\u5e03\uff08\u540e\u7eed\uff09',
            referenceUnavailable: '\u6682\u4e0d\u53ef\u76f4\u63a5\u5c55\u793a\uff1a\u9700\u8981\u516c\u53f8\u7cfb\u7edf\u56fe\u7247\u8bbf\u95ee\u89c4\u5219',
            referenceIds: 'Reference IDs',
            referenceUsage: '\u53c2\u8003\u7528\u6cd5',
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
            referenceRequired: 'Reference Required',
            negativePrompt: 'Negative Prompt',
            notes: 'Notes',
            readiness: 'Readiness',
            references: 'References',
            referenceImages: 'Reference Images',
            referenceLinks: 'Reference Links',
            noReferences: 'This project did not return reference images or links.',
            openReference: 'Open Link',
            addToCanvasSoon: 'Add to Canvas (soon)',
            referenceUnavailable: 'Cannot display directly yet: company image access rules are required.',
            referenceIds: 'Reference IDs',
            referenceUsage: 'Reference Usage',
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
                                    const safeUrl = isSafeHttpReferenceUrl(item.url);
                                    const canOpenImageReference = safeUrl && item.safeToDisplay !== false;
                                    return (
                                        <div
                                            key={item.id || `${item.url}-${index}`}
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
                                                    <div className="truncate text-[10px] text-neutral-500">{getReferenceDomain(item.url)}</div>
                                                    <div className="truncate text-[10px] text-neutral-500">{item.url}</div>
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
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noreferrer noopener"
                                                        className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                                                            isDark
                                                                ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'
                                                                : 'border-neutral-200 text-neutral-700 hover:bg-white'
                                                        }`}
                                                    >
                                                        {proposalText.openReference}
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
                                    const safeUrl = isSafeHttpReferenceUrl(item.url);
                                    return (
                                        <div
                                            key={item.id || `${item.url}-${index}`}
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
                                                    {formatHermesValue(item.type || 'product_reference', { compact: true })} · {getReferenceDomain(item.url)}
                                                </div>
                                            </div>
                                            {safeUrl && (
                                                <a
                                                    href={item.url}
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
                        <div className="space-y-2">
                            {designTasks.map((task, index) => {
                                const notes = getHermesStringList(task.notes);
                                const referenceIds = getHermesStringList(task.referenceIds);
                                const needsReferences = Boolean(task.referenceRequired);
                                return (
                                    <div
                                        key={task.taskId || `${task.title || 'task'}-${index}`}
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
                                            <span className="text-neutral-500">{proposalText.referenceRequired}</span>
                                            <span>{task.referenceRequired ? proposalText.yes : proposalText.no}</span>
                                        </div>
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
    } = useChatAgent();

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
                                                    {session.messageCount} {t(language, 'messages')} · {formatDate(session.updatedAt || session.createdAt)}
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
                                    <HermesResultCard
                                        hermesRun={msg.hermesRun}
                                        canvasTheme={canvasTheme}
                                        language={language}
                                    />
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
