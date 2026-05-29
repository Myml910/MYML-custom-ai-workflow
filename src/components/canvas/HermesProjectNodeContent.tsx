import React, { useState } from 'react';
import { ExternalLink, Image as ImageIcon, Layers, Sparkles } from 'lucide-react';
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

export const HermesProjectNodeContent: React.FC<HermesProjectNodeContentProps> = ({
    data,
    language = 'zh'
}) => {
    const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());
    const hermesProject = isRecord(data.hermesProject) ? data.hermesProject : {};
    const project = isRecord(hermesProject.project) ? hermesProject.project : {};
    const projectBrief = isRecord(hermesProject.projectBrief) ? hermesProject.projectBrief : {};
    const references = isRecord(hermesProject.references) ? hermesProject.references : {};
    const designTasks = Array.isArray(hermesProject.designTasks) ? hermesProject.designTasks.filter(isRecord) : [];
    const referenceImages = Array.isArray(references.images) ? references.images.filter(isRecord) : [];
    const referenceLinks = Array.isArray(references.links) ? references.links.filter(isRecord) : [];

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

    const projectCode = asString(hermesProject.projectCode) ||
        asString(getField(project, ['code', 'projectCode'])) ||
        asString(getField(projectBrief, ['projectCode']));
    const projectName = asString(getField(project, ['name', 'projectName'])) ||
        asString(getField(projectBrief, ['projectName']));
    const status = asString(hermesProject.status) || 'completed';
    const expected = typeof hermesProject.expectedDesignTaskCount === 'number' ? hermesProject.expectedDesignTaskCount : null;
    const actual = typeof hermesProject.actualDesignTaskCount === 'number' ? hermesProject.actualDesignTaskCount : designTasks.length;
    const max = typeof hermesProject.maxDesignsPerGeneration === 'number' ? hermesProject.maxDesignsPerGeneration : null;

    const summaryRows = ([
        [text.customer, getField(project, ['customer', 'customerName']) || getField(projectBrief, ['customer'])],
        [text.category, getField(project, ['category']) || getField(projectBrief, ['category'])],
        [text.craft, getField(project, ['craft']) || getField(projectBrief, ['craft'])],
        [text.size, getField(project, ['sizeRequirement', 'size']) || getField(projectBrief, ['size'])],
        [text.quantity, getField(project, ['quantityRequirement', 'quantity']) || getField(projectBrief, ['quantity'])],
        [text.requirement, getField(project, ['developmentRequirement', 'brief', 'objective']) || getField(projectBrief, ['designRequirement'])],
    ] as [string, unknown][]).filter(([, value]) => asString(value));

    const markImageFailed = (id: string) => {
        setFailedImageIds(prev => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
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

                <section>
                    <div className="mb-2 text-xs font-semibold text-[var(--myml-text-primary)]">{text.designTasks}</div>
                    {designTasks.length === 0 ? (
                        <div className="rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] p-3 text-xs text-[var(--myml-text-muted)]">
                            {text.noTasks}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {designTasks.map((task, index) => {
                                const title = asString(task.title) || asString(task.taskId) || `Task ${index + 1}`;
                                return (
                                    <div key={`${title}-${index}`} className="rounded-lg border border-[var(--myml-border-default)] bg-[var(--myml-surface-base)] p-3 text-xs">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-[var(--myml-text-primary)]">{title}</div>
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
