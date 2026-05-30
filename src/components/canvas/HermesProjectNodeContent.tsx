import React, { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Image as ImageIcon, Layers, Sparkles } from 'lucide-react';
import { NodeData } from '../../types';
import type { Language } from '../../i18n/translations';

interface HermesProjectNodeContentProps {
    data: NodeData;
    language?: Language;
}

const SUMMARY_TEXT_LIMIT = 180;
const TASK_REASON_LIMIT = 140;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

function getField(record: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        const value = record[key];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
}

function truncateText(value: unknown, limit = SUMMARY_TEXT_LIMIT): string {
    const text = asString(value);
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

function isDisplayableImageUrl(value: string): boolean {
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('data:image/');
}

function getReferenceUrl(item: Record<string, unknown>): string {
    return asString(item.url) || asString(item.resolvedUrl);
}

function getReferenceRawValue(item: Record<string, unknown>): string {
    return asString(item.rawValue) || getReferenceUrl(item);
}

function getDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

function getDesignTaskId(task: Record<string, unknown>, index: number): string {
    return asString(task.taskId) || asString(task.id) || `concept_${String(index + 1).padStart(2, '0')}`;
}

function getDraftStatusClass(status: string): string {
    if (status === 'completed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-300';
    if (status === 'queued' || status === 'running' || status === 'polling' || status === 'pending') {
        return 'border-[var(--myml-accent)]/30 bg-[var(--myml-accent)]/10 text-[var(--myml-accent)]';
    }
    return 'border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] text-[var(--myml-text-muted)]';
}

async function copyTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

function buildStructuredPromptPackage(task: Record<string, unknown>): string {
    const explicitGenerationPrompt = asString(task.generationPrompt);
    if (explicitGenerationPrompt) return explicitGenerationPrompt;

    const structuredPromptDescription = isRecord(task.structuredPromptDescription)
        ? task.structuredPromptDescription
        : null;
    const prompt = asString(task.prompt);
    const negativePrompt = asString(task.negativePrompt);

    if (!structuredPromptDescription) return prompt;

    const details = isRecord(structuredPromptDescription.detailedVisualElements)
        ? structuredPromptDescription.detailedVisualElements
        : {};
    const lines = [
        '## Pattern Design Prompt Description',
        '',
        '**1. Core Subject & Theme (核心主体与主题):**',
        asString(structuredPromptDescription.coreSubjectAndTheme),
        '',
        '**2. Product Context & Usage (产品语境与用途):**',
        asString(structuredPromptDescription.productContextAndUsage),
        '',
        '**3. Art Style & Medium (艺术风格与媒介):**',
        asString(structuredPromptDescription.artStyleAndMedium),
        '',
        '**4. Color Palette & Mood (配色与氛围):**',
        asString(structuredPromptDescription.colorPaletteAndMood),
        '',
        '**5. Composition & Layout (构图与布局):**',
        asString(structuredPromptDescription.compositionAndLayout),
        '',
        '**6. Detailed Visual Elements (分层细节描述):**',
        `* **Main Focus (Center/Midground):** ${asString(details.mainFocus)}`,
        `* **Background & Atmosphere:** ${asString(details.backgroundAtmosphere)}`,
        `* **Foreground & Framing:** ${asString(details.foregroundFraming)}`,
        `* **Specific Details/Props:** ${asString(details.specificDetailsProps)}`,
        '',
        '**7. Text & Typography (文字与字体，如有):**',
        asString(structuredPromptDescription.textAndTypography) || 'None',
        '',
        '**8. Pattern / Production Constraints (图案与生产约束):**',
        asString(structuredPromptDescription.patternProductionConstraints),
        '',
        '**9. Reference Usage (参考资料使用说明):**',
        asString(structuredPromptDescription.referenceUsage),
        '',
        '**10. Negative Constraints (负面约束):**',
        asString(structuredPromptDescription.negativeConstraints),
        '',
        '## Final Image Generation Prompt',
        prompt,
        '',
        '## Negative Prompt',
        negativePrompt
    ];

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function getStructuredPromptSummary(task: Record<string, unknown>): string {
    const structuredPromptDescription = isRecord(task.structuredPromptDescription)
        ? task.structuredPromptDescription
        : null;
    if (!structuredPromptDescription) return '';
    return [
        asString(structuredPromptDescription.coreSubjectAndTheme),
        asString(structuredPromptDescription.productContextAndUsage),
        asString(structuredPromptDescription.colorPaletteAndMood),
        asString(structuredPromptDescription.patternProductionConstraints)
    ].filter(Boolean).join(' ');
}

export const HermesProjectNodeContent: React.FC<HermesProjectNodeContentProps> = ({
    data,
    language = 'zh'
}) => {
    const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());
    const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
    const copiedTimerRef = useRef<number | null>(null);
    const hermesProject = isRecord(data.hermesProject) ? data.hermesProject : {};
    const project = isRecord(hermesProject.project) ? hermesProject.project : {};
    const projectBrief = isRecord(hermesProject.projectBrief) ? hermesProject.projectBrief : {};
    const references = isRecord(hermesProject.references) ? hermesProject.references : {};
    const designTasks = Array.isArray(hermesProject.designTasks) ? hermesProject.designTasks.filter(isRecord) : [];
    const productTasks = Array.isArray(hermesProject.productTasks) ? hermesProject.productTasks.filter(isRecord) : [];
    const productTaskPrompts = Array.isArray(hermesProject.productTaskPrompts)
        ? hermesProject.productTaskPrompts.filter(isRecord)
        : [];
    const referenceImages = Array.isArray(references.images) ? references.images.filter(isRecord) : [];
    const referenceLinks = Array.isArray(references.links) ? references.links.filter(isRecord) : [];
    const generatedImages = Array.isArray(hermesProject.generatedImages)
        ? hermesProject.generatedImages.filter(isRecord)
        : [];
    const draftRunsByTaskId = isRecord(hermesProject.draftRunsByTaskId)
        ? hermesProject.draftRunsByTaskId
        : {};
    const autoDraftGeneration = isRecord(hermesProject.autoDraftGeneration)
        ? hermesProject.autoDraftGeneration
        : {};

    useEffect(() => () => {
        if (copiedTimerRef.current) {
            window.clearTimeout(copiedTimerRef.current);
        }
    }, []);

    const text = language === 'zh'
        ? {
            project: 'Hermes 项目',
            status: '状态',
            expected: '计划',
            actual: '返回',
            max: '单批',
            summary: '项目摘要',
            customer: '客户',
            category: '品类',
            craft: '工艺',
            size: '尺寸',
            quantity: '数量',
            requirement: '开发需求',
            references: '参考资料',
            referenceImages: '参考图',
            referenceLinks: '参考链接',
            openImage: '打开原图',
            openLink: '打开链接',
            unavailableImage: '暂不可直接展示，需要公司系统图片访问规则',
            noReferences: '当前项目未返回参考资料',
            designTasks: '设计方向',
            targetSize: '尺寸',
            model: '模型',
            altModel: '备选',
            reason: '理由',
            noTasks: '当前项目未返回设计方向',
        }
        : {
            project: 'Hermes Project',
            status: 'Status',
            expected: 'Expected',
            actual: 'Returned',
            max: 'Batch max',
            summary: 'Project Summary',
            customer: 'Customer',
            category: 'Category',
            craft: 'Craft',
            size: 'Size',
            quantity: 'Quantity',
            requirement: 'Requirement',
            references: 'References',
            referenceImages: 'Reference Images',
            referenceLinks: 'Reference Links',
            openImage: 'Open image',
            openLink: 'Open link',
            unavailableImage: 'Cannot display directly yet. Company image access rules are required.',
            noReferences: 'This project did not return references.',
            designTasks: 'Design Directions',
            targetSize: 'Size',
            model: 'Model',
            altModel: 'Alternative',
            reason: 'Reason',
            noTasks: 'This project did not return design directions.',
        };

    const draftText = {
        drafts: language === 'zh' ? 'AI 候选图' : 'AI candidates',
        draftStatus: language === 'zh' ? '状态' : 'Status',
        draftModel: language === 'zh' ? '草稿模型' : 'Draft model',
        generationTask: language === 'zh' ? '生成任务' : 'Generation task',
        openResult: language === 'zh' ? '打开结果' : 'Open result',
        copyPrompt: language === 'zh' ? '复制结构化 Prompt' : 'Copy structured prompt',
        copied: language === 'zh' ? '已复制' : 'Copied',
        progress: language === 'zh' ? '进度' : 'Progress',
        resultImage: language === 'zh' ? '生成结果' : 'Generated result',
        noDraftYet: language === 'zh' ? '等待自动生成' : 'Waiting for auto generation',
        structuredReady: language === 'zh' ? '结构化 Prompt 已生成' : 'Structured prompt ready',
        structuredMissing: language === 'zh' ? '结构化 Prompt 未生成' : 'Structured prompt missing',
        structuredDetails: language === 'zh' ? '结构化提示词描述' : 'Structured prompt description',
        finalPrompt: 'Final Prompt',
        negativePrompt: 'Negative Prompt'
    };

    const productText = {
        productTasks: language === 'zh' ? '\u4ea7\u54c1\u62c6\u89e3' : 'Product Decomposition',
        product: language === 'zh' ? '\u4ea7\u54c1' : 'Product',
        referenceHint: language === 'zh' ? '\u53c2\u8003' : 'Reference',
        designFocus: language === 'zh' ? '\u8bbe\u8ba1\u91cd\u70b9' : 'Design focus',
        priority: language === 'zh' ? '\u4f18\u5148\u7ea7' : 'Priority',
        promptStatus: language === 'zh' ? '\u63d0\u793a\u8bcd\u72b6\u6001' : 'Prompt status',
        promptFailed: language === 'zh' ? '\u90e8\u5206\u4ea7\u54c1\u4efb\u52a1\u63d0\u793a\u8bcd\u751f\u6210\u5931\u8d25\uff0c\u5df2\u8bb0\u5f55\u5b89\u5168\u9519\u8bef\u3002' : 'Some product task prompts failed; safe errors are recorded.',
        waitingStage2: language === 'zh'
            ? '\u5df2\u5b8c\u6210\u4ea7\u54c1\u62c6\u89e3\uff0c\u7b49\u5f85 Stage 2 \u751f\u6210\u63d0\u793a\u8bcd\u3002'
            : 'Product decomposition is complete. Waiting for Stage 2 prompt generation.'
    };

    const projectCode = asString(hermesProject.projectCode) ||
        asString(getField(project, ['code', 'projectCode'])) ||
        asString(getField(projectBrief, ['projectCode']));
    const projectName = asString(getField(project, ['name', 'projectName'])) ||
        asString(getField(projectBrief, ['projectName']));
    const status = asString(hermesProject.status) || 'completed';
    const expected = typeof hermesProject.expectedDesignTaskCount === 'number' ? hermesProject.expectedDesignTaskCount : null;
    const actual = typeof hermesProject.actualDesignTaskCount === 'number' ? hermesProject.actualDesignTaskCount : designTasks.length;
    const max = typeof hermesProject.maxDesignsPerGeneration === 'number' ? hermesProject.maxDesignsPerGeneration : null;
    const generatedImageByTaskId = new Map<string, Record<string, unknown>>();
    generatedImages.forEach((image) => {
        const designTaskId = asString(image.designTaskId);
        if (designTaskId) {
            generatedImageByTaskId.set(designTaskId, image);
        }
    });
    const productPromptByTaskId = new Map<string, Record<string, unknown>>();
    productTaskPrompts.forEach((item) => {
        const productTaskId = asString(item.productTaskId);
        if (productTaskId) {
            productPromptByTaskId.set(productTaskId, item);
        }
    });
    const hasProductPromptFailures = productTaskPrompts.some(item => asString(item.status) === 'failed');

    const summaryRows = ([
        [text.customer, getField(project, ['customer', 'customerName']) || getField(projectBrief, ['customer'])],
        [text.category, getField(project, ['category']) || getField(projectBrief, ['category'])],
        [text.craft, getField(project, ['craft']) || getField(projectBrief, ['craft'])],
        [text.size, getField(project, ['sizeRequirement', 'size']) || getField(projectBrief, ['sizeRequirement', 'size'])],
        [text.quantity, getField(project, ['quantityRequirement', 'quantity']) || getField(projectBrief, ['quantityRequirement', 'quantity'])],
        [text.requirement, getField(project, ['developmentRequirement', 'brief', 'objective']) || getField(projectBrief, ['designRequirement', 'summary'])],
    ] as [string, unknown][]).filter(([, value]) => asString(value));

    const markImageFailed = (id: string) => {
        setFailedImageIds(prev => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    };

    const copyPrompt = async (taskId: string, textToCopy: string) => {
        if (!textToCopy.trim()) return;
        await copyTextToClipboard(textToCopy);
        setCopiedTaskId(taskId);
        if (copiedTimerRef.current) {
            window.clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = window.setTimeout(() => setCopiedTaskId(null), 1400);
    };

    return (
        <div className="flex max-h-[720px] w-full flex-col overflow-hidden rounded-[var(--myml-radius-panel)] bg-[var(--myml-surface-raised)] text-[var(--myml-text-primary)]">
            <div className="border-b border-[var(--myml-border-default)] bg-[var(--myml-surface-floating)] px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-[var(--myml-accent)]">
                            <Sparkles size={13} />
                            <span>{text.project}</span>
                        </div>
                        <div className="mt-1 truncate text-base font-semibold">
                            {projectName || projectCode || data.title || text.project}
                        </div>
                        {projectCode && (
                            <div className="mt-0.5 text-xs text-[var(--myml-text-muted)]">{projectCode}</div>
                        )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-[10px]">
                        <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-300">
                            {text.status}: {status}
                        </span>
                        <span className="text-[var(--myml-text-muted)]">
                            {text.expected}: {expected ?? '-'} · {text.actual}: {actual} · {text.max}: {max ?? '-'}
                        </span>
                        {asString(autoDraftGeneration.status) && (
                            <span className={`rounded-md border px-2 py-0.5 font-semibold ${getDraftStatusClass(asString(autoDraftGeneration.status))}`}>
                                {draftText.drafts}: {asString(autoDraftGeneration.status)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4" onWheel={(event) => event.stopPropagation()}>
                <section className="mb-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--myml-text-primary)]">
                        <Layers size={14} />
                        <span>{text.summary}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        {summaryRows.map(([label, value]) => (
                            <div
                                key={label}
                                className="rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] p-2"
                            >
                                <div className="mb-1 text-[10px] text-[var(--myml-text-muted)]">{label}</div>
                                <div className="whitespace-pre-wrap break-words leading-relaxed">
                                    {truncateText(value, label === text.requirement ? 220 : 90)}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mb-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--myml-text-primary)]">
                        <ImageIcon size={14} />
                        <span>{text.references}</span>
                    </div>
                    {referenceImages.length === 0 && referenceLinks.length === 0 ? (
                        <div className="rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] p-3 text-xs text-[var(--myml-text-muted)]">
                            {text.noReferences}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {referenceImages.length > 0 && (
                                <div>
                                    <div className="mb-1 text-[10px] font-semibold text-[var(--myml-text-muted)]">{text.referenceImages}</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {referenceImages.map((item, index) => {
                                            const id = asString(item.id) || `image-${index}`;
                                            const url = getReferenceUrl(item);
                                            const rawValue = getReferenceRawValue(item);
                                            const canDisplay = item.safeToDisplay === true && isHttpUrl(url) && !failedImageIds.has(id);

                                            return (
                                                <div key={id} className="overflow-hidden rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)]">
                                                    {canDisplay ? (
                                                        <img
                                                            src={url}
                                                            alt={asString(item.label) || text.referenceImages}
                                                            className="h-28 w-full object-cover"
                                                            loading="lazy"
                                                            decoding="async"
                                                            draggable={false}
                                                            onError={() => markImageFailed(id)}
                                                        />
                                                    ) : (
                                                        <div className="flex h-28 flex-col items-center justify-center gap-2 px-2 text-center text-[11px] text-[var(--myml-text-muted)]">
                                                            <ImageIcon size={18} />
                                                            <span>{text.unavailableImage}</span>
                                                        </div>
                                                    )}
                                                    <div className="space-y-1 p-2 text-[10px]">
                                                        <div className="font-semibold text-[var(--myml-text-primary)]">
                                                            {asString(item.label) || text.referenceImages}
                                                        </div>
                                                        <div className="break-all text-[var(--myml-text-muted)]">
                                                            {rawValue}
                                                        </div>
                                                        {isHttpUrl(url) && (
                                                            <a
                                                                href={url}
                                                                target="_blank"
                                                                rel="noreferrer noopener"
                                                                className="inline-flex items-center gap-1 font-semibold text-[var(--myml-accent)] underline-offset-2 hover:underline"
                                                                onClick={(event) => event.stopPropagation()}
                                                            >
                                                                {text.openImage}
                                                                <ExternalLink size={10} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {referenceLinks.length > 0 && (
                                <div>
                                    <div className="mb-1 text-[10px] font-semibold text-[var(--myml-text-muted)]">{text.referenceLinks}</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {referenceLinks.map((item, index) => {
                                            const id = asString(item.id) || `link-${index}`;
                                            const url = getReferenceUrl(item);
                                            const rawValue = getReferenceRawValue(item);
                                            const openable = item.safeToOpen !== false && isHttpUrl(url);

                                            return (
                                                <div key={id} className="rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] p-2 text-[10px]">
                                                    <div className="font-semibold text-[var(--myml-text-primary)]">
                                                        {asString(item.label) || text.referenceLinks}
                                                    </div>
                                                    <div className="mt-1 text-[var(--myml-text-muted)]">{openable ? getDomain(url) : rawValue}</div>
                                                    {openable && (
                                                        <a
                                                            href={url}
                                                            target="_blank"
                                                            rel="noreferrer noopener"
                                                            className="mt-1 inline-flex items-center gap-1 font-semibold text-[var(--myml-accent)] underline-offset-2 hover:underline"
                                                            onClick={(event) => event.stopPropagation()}
                                                        >
                                                            {text.openLink}
                                                            <ExternalLink size={10} />
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {productTasks.length > 0 && (
                    <section className="mb-4">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--myml-text-primary)]">
                            <Layers size={14} />
                            <span>{productText.productTasks}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            {productTasks.map((task, index) => {
                                const productTaskId = asString(task.productTaskId) || `product-${index}`;
                                const product = asString(task.product) || `${productText.product} ${index + 1}`;
                                const size = asString(task.size);
                                const referenceHint = asString(task.referenceHint);
                                const designFocus = asString(task.designFocus);
                                const priority = typeof task.priority === 'number' ? task.priority : null;
                                const promptStatus = productPromptByTaskId.get(productTaskId);
                                const promptStatusText = asString(promptStatus?.status);
                                const promptError = asString(promptStatus?.errorMessageSafe);

                                return (
                                    <div
                                        key={productTaskId}
                                        className="rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] p-3 text-xs"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-[var(--myml-text-primary)]">{product}</div>
                                                {size && (
                                                    <div className="mt-0.5 text-[10px] text-[var(--myml-text-muted)]">
                                                        {text.size}: {size}
                                                    </div>
                                                )}
                                            </div>
                                            {priority !== null && (
                                                <span className="shrink-0 rounded-md border border-[var(--myml-border-default)] px-2 py-0.5 text-[10px] text-[var(--myml-text-muted)]">
                                                    {productText.priority}: {priority}
                                                </span>
                                            )}
                                        </div>
                                        {(referenceHint || designFocus) && (
                                            <div className="mt-2 space-y-1 text-[11px] text-[var(--myml-text-muted)]">
                                                {referenceHint && <div>{productText.referenceHint}: {truncateText(referenceHint, 120)}</div>}
                                                {designFocus && <div>{productText.designFocus}: {truncateText(designFocus, 180)}</div>}
                                            </div>
                                        )}
                                        {promptStatusText && (
                                            <div className="mt-2 text-[10px] text-[var(--myml-text-muted)]">
                                                {productText.promptStatus}: {promptStatusText}
                                            </div>
                                        )}
                                        {promptError && (
                                            <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">
                                                {promptError}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                <section>
                    <div className="mb-2 text-xs font-semibold text-[var(--myml-text-primary)]">{text.designTasks}</div>
                    {designTasks.length === 0 ? (
                        <div className="rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] p-3 text-xs text-[var(--myml-text-muted)]">
                            {hasProductPromptFailures ? productText.promptFailed : hermesProject.lightweightMode === true ? productText.waitingStage2 : text.noTasks}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {designTasks.map((task, index) => {
                                const taskId = getDesignTaskId(task, index);
                                const draftRun = isRecord(draftRunsByTaskId[taskId]) ? draftRunsByTaskId[taskId] : null;
                                const generatedImage = generatedImageByTaskId.get(taskId) || null;
                                const title = asString(task.title) || taskId || `Task ${index + 1}`;
                                const draftStatus = asString(generatedImage?.status) || asString(draftRun?.status) || 'idle';
                                const draftResultUrl = asString(generatedImage?.imageUrl) || asString(generatedImage?.resultUrl) || asString(draftRun?.resultUrl);
                                const structuredPromptPackage = asString(generatedImage?.generationPrompt) ||
                                    asString(draftRun?.generationPrompt) ||
                                    asString(task.generationPrompt) ||
                                    buildStructuredPromptPackage(task);
                                const finalPrompt = asString(generatedImage?.finalPrompt) ||
                                    asString(draftRun?.finalPrompt) ||
                                    asString(task.prompt);
                                const negativePrompt = asString(generatedImage?.negativePrompt) ||
                                    asString(draftRun?.negativePrompt) ||
                                    asString(task.negativePrompt);
                                const promptToCopy = structuredPromptPackage ||
                                    asString(generatedImage?.prompt) ||
                                    asString(draftRun?.prompt) ||
                                    finalPrompt;
                                const hasStructuredPrompt = Boolean(asString(task.generationPrompt) || isRecord(task.structuredPromptDescription));
                                const structuredPromptSummary = getStructuredPromptSummary(task);
                                const draftImageModel = asString(generatedImage?.model) || asString(draftRun?.imageModel) || asString(draftRun?.normalizedModelRecommendation);
                                const generationTaskId = asString(generatedImage?.generationTaskId) || asString(draftRun?.generationTaskId);
                                const draftProvider = asString(generatedImage?.provider) || asString(draftRun?.provider);
                                const draftProgress = typeof draftRun?.progress === 'number' ? draftRun.progress : null;
                                return (
                                    <div key={taskId} className="rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] p-3 text-xs">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-[var(--myml-text-primary)]">{title}</div>
                                                {asString(task.product) && (
                                                    <div className="mt-0.5 text-[10px] text-[var(--myml-text-muted)]">
                                                        {productText.product}: {asString(task.product)}
                                                    </div>
                                                )}
                                                {asString(task.targetSize) && (
                                                    <div className="mt-0.5 text-[10px] text-[var(--myml-text-muted)]">
                                                        {text.targetSize}: {asString(task.targetSize)}
                                                    </div>
                                                )}
                                            </div>
                                            {asString(task.modelRecommendation) && (
                                                <span className="shrink-0 rounded-md border border-[var(--myml-border-default)] px-2 py-0.5 text-[10px] text-[var(--myml-text-muted)]">
                                                    {asString(task.modelRecommendation)}
                                                </span>
                                            )}
                                        </div>
                                        {(asString(task.alternativeModelRecommendation) || asString(task.modelReason)) && (
                                            <div className="mt-2 space-y-1 text-[11px] text-[var(--myml-text-muted)]">
                                                {asString(task.alternativeModelRecommendation) && (
                                                    <div>{text.altModel}: {asString(task.alternativeModelRecommendation)}</div>
                                                )}
                                                {asString(task.modelReason) && (
                                                    <div>{text.reason}: {truncateText(task.modelReason, TASK_REASON_LIMIT)}</div>
                                                )}
                                            </div>
                                        )}
                                        <details className="mt-2 rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-raised)] px-2 py-1 text-[10px] text-[var(--myml-text-muted)]">
                                            <summary
                                                className="cursor-pointer select-none font-semibold text-[var(--myml-text-secondary)]"
                                                onPointerDown={(event) => event.stopPropagation()}
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                {hasStructuredPrompt ? draftText.structuredReady : draftText.structuredMissing}
                                            </summary>
                                            <div className="mt-2 space-y-1">
                                                {structuredPromptSummary && (
                                                    <div>
                                                        <span className="font-semibold text-[var(--myml-text-secondary)]">{draftText.structuredDetails}: </span>
                                                        {truncateText(structuredPromptSummary, 260)}
                                                    </div>
                                                )}
                                                {finalPrompt && (
                                                    <div>
                                                        <span className="font-semibold text-[var(--myml-text-secondary)]">{draftText.finalPrompt}: </span>
                                                        {truncateText(finalPrompt, 260)}
                                                    </div>
                                                )}
                                                {negativePrompt && (
                                                    <div>
                                                        <span className="font-semibold text-[var(--myml-text-secondary)]">{draftText.negativePrompt}: </span>
                                                        {truncateText(negativePrompt, 220)}
                                                    </div>
                                                )}
                                            </div>
                                        </details>
                                        <div className="mt-3 rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-raised)] p-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${getDraftStatusClass(draftStatus)}`}>
                                                    {draftText.draftStatus}: {draftStatus}
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={!promptToCopy}
                                                    className="inline-flex items-center gap-1 rounded-md border border-[var(--myml-border-default)] px-2 py-1 text-[10px] font-semibold text-[var(--myml-text-secondary)] transition-colors hover:border-[var(--myml-accent)] hover:text-[var(--myml-accent)] disabled:cursor-not-allowed disabled:opacity-45"
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void copyPrompt(taskId, promptToCopy);
                                                    }}
                                                >
                                                    <Copy size={11} />
                                                    {copiedTaskId === taskId ? draftText.copied : draftText.copyPrompt}
                                                </button>
                                            </div>

                                            <div className="mt-2 space-y-1 text-[10px] text-[var(--myml-text-muted)]">
                                                {draftImageModel && <div>{draftText.draftModel}: {draftImageModel}</div>}
                                                {draftProvider && <div>Provider: {draftProvider}</div>}
                                                {generationTaskId && <div>{draftText.generationTask}: {generationTaskId}</div>}
                                                {draftProgress !== null && <div>{draftText.progress}: {Math.round(draftProgress)}%</div>}
                                                {!draftRun && <div>{draftText.noDraftYet}</div>}
                                            </div>

                                            {draftResultUrl && (
                                                <div className="mt-2 overflow-hidden rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)]">
                                                    {isDisplayableImageUrl(draftResultUrl) && (
                                                        <img
                                                            src={draftResultUrl}
                                                            alt={draftText.resultImage}
                                                            className="max-h-48 w-full object-contain"
                                                            loading="lazy"
                                                            decoding="async"
                                                            draggable={false}
                                                        />
                                                    )}
                                                    <div className="flex items-center justify-between gap-2 p-2 text-[10px]">
                                                        <span className="truncate text-[var(--myml-text-muted)]">{draftResultUrl}</span>
                                                        <a
                                                            href={draftResultUrl}
                                                            target="_blank"
                                                            rel="noreferrer noopener"
                                                            className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--myml-accent)] underline-offset-2 hover:underline"
                                                            onPointerDown={(event) => event.stopPropagation()}
                                                            onClick={(event) => event.stopPropagation()}
                                                        >
                                                            {draftText.openResult}
                                                            <ExternalLink size={10} />
                                                        </a>
                                                    </div>
                                                </div>
                                            )}

                                            {draftStatus === 'failed' && (asString(generatedImage?.errorMessageSafe) || asString(draftRun?.errorMessage)) && (
                                                <div className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">
                                                    {asString(generatedImage?.errorMessageSafe) || asString(draftRun?.errorMessage)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
