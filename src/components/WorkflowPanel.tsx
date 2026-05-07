/**
 * WorkflowPanel.tsx
 *
 * Panel for browsing and managing saved workflows.
 * Shows list of workflows with options to load, delete, or edit cover.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, FileText, Loader2, Maximize2, Minimize2, Pencil, Check } from 'lucide-react';
import { LazyImage } from './LazyImage';
import { Language, t } from '../i18n/translations';

interface WorkflowSummary {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodeCount: number;
    coverUrl?: string;
    description?: string;
}

interface AssetMetadata {
    id: string;
    url: string;
    prompt?: string;
    createdAt: string;
}

interface WorkflowPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onLoadWorkflow: (workflowId: string) => void;
    currentWorkflowId?: string;
    panelY?: number;
    canvasTheme?: 'dark' | 'light';
    language?: Language;
}

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({
    isOpen,
    onClose,
    onLoadWorkflow,
    currentWorkflowId,
    panelY = 200,
    canvasTheme = 'dark',
    language = 'zh'
}) => {
    const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
    const [publicWorkflows, setPublicWorkflows] = useState<WorkflowSummary[]>([]);
    const [activeTab, setActiveTab] = useState<'my' | 'public'>('my');
    const [loading, setLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const [editingCoverFor, setEditingCoverFor] = useState<string | null>(null);
    const [coverAssets, setCoverAssets] = useState<AssetMetadata[]>([]);
    const [loadingAssets, setLoadingAssets] = useState(false);

    const COVERS_PER_PAGE = 9;
    const [visibleCoverCount, setVisibleCoverCount] = useState(COVERS_PER_PAGE);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    const isDark = canvasTheme === 'dark';

    useEffect(() => {
        if (isOpen) {
            fetchWorkflows();
            fetchPublicWorkflows();
        } else {
            setIsExpanded(false);
        }
    }, [isOpen]);

    const fetchWorkflows = async () => {
        setLoading(true);

        try {
            const response = await fetch('/api/workflows');

            if (response.ok) {
                const data = await response.json();
                setWorkflows(data);
            }
        } catch (error) {
            console.error('Failed to fetch workflows:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPublicWorkflows = async () => {
        try {
            const response = await fetch('/api/public-workflows');

            if (response.ok) {
                const data = await response.json();
                setPublicWorkflows(data);
            }
        } catch (error) {
            console.error('Failed to fetch public workflows:', error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const response = await fetch(`/api/workflows/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setWorkflows(prev => prev.filter(w => w.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete workflow:', error);
        }

        setDeleteConfirm(null);
    };

    const loadMoreCovers = useCallback(() => {
        setVisibleCoverCount(prev => Math.min(prev + COVERS_PER_PAGE, coverAssets.length));
    }, [coverAssets.length]);

    useEffect(() => {
        if (!editingCoverFor || loadingAssets) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && visibleCoverCount < coverAssets.length) {
                    loadMoreCovers();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [editingCoverFor, loadingAssets, visibleCoverCount, coverAssets.length, loadMoreCovers]);

    const openCoverEditor = async (workflowId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingCoverFor(workflowId);
        setLoadingAssets(true);
        setVisibleCoverCount(COVERS_PER_PAGE);

        try {
            const response = await fetch('/api/assets/images');

            if (response.ok) {
                const data = await response.json();
                setCoverAssets(data);
            }
        } catch (error) {
            console.error('Failed to fetch assets:', error);
        } finally {
            setLoadingAssets(false);
        }
    };

    const selectCover = async (assetUrl: string) => {
        if (!editingCoverFor) return;

        try {
            const response = await fetch(`/api/workflows/${editingCoverFor}/cover`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coverUrl: assetUrl })
            });

            if (response.ok) {
                setWorkflows(prev =>
                    prev.map(w =>
                        w.id === editingCoverFor
                            ? { ...w, coverUrl: assetUrl }
                            : w
                    )
                );
            }
        } catch (error) {
            console.error('Failed to update cover:', error);
        }

        setEditingCoverFor(null);
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Main Panel */}
            <div
                className={`fixed backdrop-blur-xl border rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden motion-panel-in transition-all duration-300 ${
                    isExpanded
                        ? 'left-24 right-24 top-20 bottom-20 max-h-none'
                        : 'left-20 w-[700px] max-h-[500px]'
                } ${
                    isDark
                        ? 'bg-[#0a0a0a]/95 border-neutral-800'
                        : 'bg-white/95 border-neutral-200'
                }`}
                style={isExpanded ? undefined : { top: panelY }}
            >
                {/* Header with Tabs */}
                <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setActiveTab('my')}
                            className={`font-medium pb-1 transition-colors ${
                                activeTab === 'my'
                                    ? isDark
                                        ? 'text-[#D8FF00] border-b-2 border-[#D8FF00]'
                                        : 'text-lime-600 border-b-2 border-lime-600'
                                    : isDark
                                        ? 'text-neutral-500 hover:text-neutral-300'
                                        : 'text-neutral-400 hover:text-neutral-600'
                            }`}
                        >
                            {t(language, 'myWorkflowsTab')}
                        </button>

                        <button
                            onClick={() => setActiveTab('public')}
                            className={`font-medium pb-1 transition-colors ${
                                activeTab === 'public'
                                    ? isDark
                                        ? 'text-[#D8FF00] border-b-2 border-[#D8FF00]'
                                        : 'text-lime-600 border-b-2 border-lime-600'
                                    : isDark
                                        ? 'text-neutral-500 hover:text-neutral-300'
                                        : 'text-neutral-400 hover:text-neutral-600'
                            }`}
                        >
                            {t(language, 'publicWorkflows')}
                        </button>
                    </div>

                    <button
                        onClick={() => setIsExpanded(prev => !prev)}
                        className={`p-2 rounded-lg transition-all duration-150 motion-press ${
                            isDark
                                ? 'text-neutral-500 hover:text-[#D8FF00] hover:bg-[#D8FF00]/10'
                                : 'text-neutral-400 hover:text-lime-600 hover:bg-lime-50'
                        }`}
                        title={isExpanded ? 'Collapse panel' : 'Expand panel'}
                    >
                        {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                </div>

                {/* Content */}
                <div
                    className="flex-1 overflow-y-auto p-4"
                    style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: isDark ? '#525252 #171717' : '#d4d4d4 #fafafa'
                    }}
                >
                    {loading && activeTab === 'my' ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className={`animate-spin ${isDark ? 'text-[#D8FF00]' : 'text-lime-600'}`} size={24} />
                        </div>
                    ) : activeTab === 'my' ? (
                        workflows.length === 0 ? (
                            <div className="flex items-center justify-center h-40 text-neutral-500">
                                {t(language, 'noWorkflowsFound')}
                            </div>
                        ) : (
                            <div className={`grid gap-4 ${isExpanded ? 'grid-cols-5' : 'grid-cols-3'}`}>
                                {workflows.map(workflow => (
                                    <div
                                        key={workflow.id}
                                        onClick={() => onLoadWorkflow(workflow.id)}
                                        className={`rounded-xl overflow-hidden cursor-pointer transition-all group ${
                                            workflow.id === currentWorkflowId
                                                ? isDark
                                                    ? 'ring-2 ring-[#D8FF00]'
                                                    : 'ring-2 ring-lime-500'
                                                : ''
                                        }`}
                                    >
                                        <div className="aspect-[4/3] bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center relative overflow-hidden">
                                            {workflow.coverUrl ? (
                                                <img
                                                    src={workflow.coverUrl}
                                                    alt={workflow.title || t(language, 'untitled')}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${
                                                    isDark
                                                        ? 'bg-gradient-to-br from-[#D8FF00]/20 to-neutral-800'
                                                        : 'bg-gradient-to-br from-lime-100 to-neutral-100'
                                                }`}>
                                                    <FileText size={28} className="text-neutral-500" />
                                                </div>
                                            )}

                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                <button
                                                    onClick={(e) => openCoverEditor(workflow.id, e)}
                                                    className={`group/edit p-1.5 bg-black/50 rounded-lg transition-all ${
                                                        isDark
                                                            ? 'hover:bg-[#D8FF00] hover:text-black'
                                                            : 'hover:bg-lime-600 hover:text-white'
                                                    }`}
                                                    title={t(language, 'editCover')}
                                                >
                                                    <Pencil size={14} className={isDark ? 'text-white group-hover/edit:text-black' : 'text-white'} />
                                                </button>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteConfirm(workflow.id);
                                                    }}
                                                    className="p-1.5 bg-black/50 hover:bg-red-500 rounded-lg transition-all"
                                                    title={t(language, 'deleteWorkflowTitle')}
                                                >
                                                    <Trash2 size={14} className="text-white" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className={`p-3 ${isDark ? 'bg-neutral-900/50' : 'bg-neutral-100/90'}`}>
                                            <h3 className={`font-medium text-sm truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                                {workflow.title || t(language, 'untitled')}
                                            </h3>

                                            <p className={`text-xs mt-0.5 ${isDark ? 'text-neutral-500' : 'text-neutral-600'}`}>
                                                {workflow.nodeCount} {t(language, 'nodes')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        publicWorkflows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-neutral-500 gap-2">
                                <FileText size={32} className="opacity-50" />
                                <p>{t(language, 'noPublicWorkflows')}</p>
                                <p className="text-xs text-neutral-600">{t(language, 'addWorkflowJsons')}</p>
                            </div>
                        ) : (
                            <div className={`grid gap-4 ${isExpanded ? 'grid-cols-5' : 'grid-cols-3'}`}>
                                {publicWorkflows.map(workflow => (
                                    <div
                                        key={workflow.id}
                                        onClick={() => onLoadWorkflow(`public:${workflow.id}`)}
                                        className="rounded-xl overflow-hidden cursor-pointer transition-all group"
                                    >
                                        <div className="aspect-[4/3] bg-gradient-to-br from-green-800/30 to-emerald-900/30 flex items-center justify-center relative overflow-hidden">
                                            {workflow.coverUrl ? (
                                                <img
                                                    src={workflow.coverUrl}
                                                    alt={workflow.title || t(language, 'untitled')}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-600/20 flex items-center justify-center">
                                                    <FileText size={28} className="text-neutral-500" />
                                                </div>
                                            )}

                                            <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-600/80 rounded text-[10px] font-medium text-white">
                                                {t(language, 'publicBadge')}
                                            </div>
                                        </div>

                                        <div className={`p-3 ${isDark ? 'bg-neutral-900/50' : 'bg-neutral-100/90'}`}>
                                            <h3 className={`font-medium text-sm truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                                {workflow.title || t(language, 'untitled')}
                                            </h3>

                                            <p className={`text-xs mt-0.5 ${isDark ? 'text-neutral-500' : 'text-neutral-600'}`}>
                                                {workflow.description || `${workflow.nodeCount} ${t(language, 'nodes')}`}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-[#1a1a1a] border border-neutral-700 rounded-2xl p-6 w-[340px] shadow-2xl">
                        <h3 className="text-lg font-semibold text-white mb-2">
                            {t(language, 'deleteWorkflow')}
                        </h3>

                        <p className="text-neutral-400 text-sm mb-6">
                            {t(language, 'deleteWorkflowConfirm')}
                        </p>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm transition-colors"
                            >
                                {t(language, 'cancel')}
                            </button>

                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors"
                            >
                                {t(language, 'delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cover Selection Modal */}
            {editingCoverFor && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-[#1a1a1a] border border-neutral-700 rounded-2xl p-6 w-[500px] max-h-[500px] shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">
                                {t(language, 'selectCoverImage')}
                            </h3>

                            <button
                                onClick={() => setEditingCoverFor(null)}
                                className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {loadingAssets ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="animate-spin text-neutral-500" size={24} />
                            </div>
                        ) : coverAssets.length === 0 ? (
                            <div className="flex items-center justify-center h-40 text-neutral-500">
                                {t(language, 'noImagesAvailable')}
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-3 overflow-y-auto flex-1">
                                {coverAssets.slice(0, visibleCoverCount).map(asset => (
                                    <button
                                        key={asset.id}
                                        onClick={() => selectCover(asset.url)}
                                        className="h-32 w-full rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all relative group bg-neutral-900"
                                    >
                                        <LazyImage
                                            src={asset.url}
                                            alt={t(language, 'coverOption')}
                                            className="w-full h-full"
                                            placeholderClassName="rounded-lg"
                                            rootMargin="100px"
                                        />

                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                            <Check size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </button>
                                ))}

                                {visibleCoverCount < coverAssets.length && (
                                    <div
                                        ref={loadMoreRef}
                                        className="col-span-3 flex items-center justify-center py-4"
                                    >
                                        <Loader2 className="animate-spin text-neutral-500" size={20} />
                                        <span className="ml-2 text-neutral-500 text-sm">
                                            {t(language, 'loadingMore')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
