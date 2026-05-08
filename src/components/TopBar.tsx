/**
 * TopBar.tsx
 *
 * Top navigation bar component with canvas title, save button, and other controls.
 */

import React, { useState } from 'react';
import { LogOut, Plus, Save, Loader2 } from 'lucide-react';
import { Language, t } from '../i18n/translations';
import { AuthUser } from '../auth/AuthContext';

interface TopBarProps {
    // Title
    canvasTitle: string;
    isEditingTitle: boolean;
    editingTitleValue: string;
    canvasTitleInputRef: React.RefObject<HTMLInputElement | null>;
    setCanvasTitle: (title: string) => void;
    setIsEditingTitle: (editing: boolean) => void;
    setEditingTitleValue: (value: string) => void;

    // Actions
    onSave: () => void | Promise<void>;
    onNew: () => void;
    hasUnsavedChanges: boolean;
    lastAutoSaveTime?: number;

    // Layout
    isChatOpen?: boolean;

    // Theme
    canvasTheme: 'dark' | 'light';
    onToggleTheme: () => void;

    // Language
    language: Language;
    onToggleLanguage: () => void;

    // Auth
    currentUser: AuthUser;
    onLogout: () => void | Promise<void>;
}

export const TopBar: React.FC<TopBarProps> = ({
    canvasTitle,
    isEditingTitle,
    editingTitleValue,
    canvasTitleInputRef,
    setCanvasTitle,
    setIsEditingTitle,
    setEditingTitleValue,
    onSave,
    onNew,
    hasUnsavedChanges,
    lastAutoSaveTime,
    isChatOpen = false,
    canvasTheme,
    onToggleTheme,
    language,
    onToggleLanguage,
    currentUser,
    onLogout
}) => {
    const [showNewConfirm, setShowNewConfirm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const themeToggleLabel = canvasTheme === 'dark'
        ? t(language, 'switchToDayMode')
        : t(language, 'switchToNightMode');

    const handleTitleBlur = () => {
        if (editingTitleValue.trim()) {
            setCanvasTitle(editingTitleValue.trim());
        } else {
            setEditingTitleValue(canvasTitle);
        }
        setIsEditingTitle(false);
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (editingTitleValue.trim()) {
                setCanvasTitle(editingTitleValue.trim());
            }
            setIsEditingTitle(false);
        } else if (e.key === 'Escape') {
            setEditingTitleValue(canvasTitle);
            setIsEditingTitle(false);
        }
    };

    const handleTitleDoubleClick = () => {
        setEditingTitleValue(canvasTitle);
        setIsEditingTitle(true);
    };

    const handleNewClick = () => {
        if (hasUnsavedChanges) {
            setShowNewConfirm(true);
        } else {
            onNew();
        }
    };

    const handleSaveAndNew = async () => {
        try {
            setIsSaving(true);
            await onSave();
            setShowNewConfirm(false);
            onNew();
        } catch (error) {
            console.error('Failed to save and new:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscardAndNew = () => {
        setShowNewConfirm(false);
        onNew();
    };

    return (
        <>
            <div
                className="fixed top-0 left-0 h-14 flex items-center justify-between px-6 z-50 pointer-events-none transition-colors duration-150"
                style={{ width: isChatOpen ? 'calc(100% - 400px)' : '100%' }}
            >
                {/* Left: Logo & Title */}
                <div className="flex items-center gap-3 pointer-events-auto">
                    <img
                        src="/TwitCanva-logo.png"
                        alt="MYML Canvas Logo"
                        className="w-8 h-8 object-contain"
                    />

                    {isEditingTitle ? (
                        <input
                            ref={canvasTitleInputRef}
                            type="text"
                            value={editingTitleValue}
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            onBlur={handleTitleBlur}
                            onKeyDown={handleTitleKeyDown}
                            aria-label={language === 'zh' ? '画布标题' : 'Canvas title'}
                            className="text-sm font-black tracking-[0.16em] uppercase text-[#D8FF00] bg-transparent border-b border-[#D8FF00] outline-none min-w-[120px] transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                        />
                    ) : (
                        <span
                            className={`text-sm font-black tracking-[0.16em] uppercase cursor-text transition-colors duration-150 border-b border-transparent ${
                                canvasTheme === 'dark'
                                    ? 'text-[#D8FF00] hover:border-[#D8FF00]/45'
                                    : 'text-black hover:text-lime-600 hover:border-lime-500/45'
                            }`}
                            onDoubleClick={handleTitleDoubleClick}
                            title={t(language, 'doubleClickToRename')}
                        >
                            {canvasTitle}
                        </span>
                    )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3 pointer-events-auto">
                    {/* Auto-save notification */}
                    {lastAutoSaveTime && !hasUnsavedChanges && (
                        <div
                            className={`text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-1 rounded-sm border motion-toast-in ${
                                canvasTheme === 'dark'
                                    ? 'text-[#D8FF00]/60 border-[#D8FF00]/20'
                                    : 'text-neutral-500 border-neutral-200'
                            }`}
                        >
                            {t(language, 'autoSaved')}{' '}
                            {new Date(lastAutoSaveTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </div>
                    )}

                    <button
                        onClick={() => onSave()}
                        aria-label={t(language, 'save')}
                        className={`text-sm px-5 py-2.5 rounded-full flex items-center gap-2 transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black font-black tracking-[0.08em] uppercase border ${
                            canvasTheme === 'dark'
                                ? 'bg-[#D8FF00] hover:bg-[#e4ff3a] text-black border-[#D8FF00] hover:shadow-[0_0_10px_rgba(216,255,0,0.16)]'
                                : 'bg-lime-600 hover:bg-lime-500 text-white border-lime-600 shadow-sm'
                        }`}
                    >
                        <Save size={16} />
                        {t(language, 'save')}
                    </button>

                    <button
                        onClick={handleNewClick}
                        aria-label={t(language, 'new')}
                        className={`text-sm px-4 py-2.5 rounded-full flex items-center gap-2 transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black font-black tracking-[0.08em] uppercase border ${
                            canvasTheme === 'dark'
                                ? 'bg-black/70 hover:bg-neutral-900 text-neutral-300 hover:text-[#D8FF00] border-neutral-800 hover:border-[#D8FF00]/45'
                                : 'bg-white hover:bg-neutral-100 text-neutral-700 hover:text-lime-600 border-neutral-200 hover:border-lime-500'
                        }`}
                    >
                        <Plus size={16} />
                        {t(language, 'new')}
                    </button>

                    <button
                        onClick={onToggleLanguage}
                        aria-label={language === 'zh' ? 'Switch to English' : '切换到中文'}
                        className={`h-10 px-3 rounded-full flex items-center justify-center transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black border text-xs font-black tracking-[0.1em] uppercase ${
                            canvasTheme === 'dark'
                                ? 'bg-black/70 border-neutral-800 text-neutral-300 hover:border-[#D8FF00]/45 hover:text-[#D8FF00]'
                                : 'bg-white border-neutral-200 text-neutral-700 hover:border-lime-500 hover:text-lime-600 shadow-sm'
                        }`}
                        title={t(language, 'language')}
                    >
                        {language === 'zh' ? 'EN' : '中文'}
                    </button>

                    <button
                        onClick={onToggleTheme}
                        aria-label={themeToggleLabel}
                        aria-pressed={canvasTheme === 'dark'}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black border ${
                            canvasTheme === 'dark'
                                ? 'bg-black/70 border-neutral-800 text-neutral-300 hover:border-[#D8FF00]/45 hover:text-[#D8FF00]'
                                : 'bg-white border-neutral-200 text-neutral-700 hover:border-lime-500 hover:text-lime-600 shadow-sm'
                        }`}
                        title={themeToggleLabel}
                    >
                        {canvasTheme === 'dark' ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5" />
                                <line x1="12" y1="1" x2="12" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="23" />
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                <line x1="1" y1="12" x2="3" y2="12" />
                                <line x1="21" y1="12" x2="23" y2="12" />
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        )}
                    </button>

                    <div
                        className={`h-10 px-3 rounded-full flex items-center gap-2 border text-xs font-black tracking-[0.08em] uppercase ${
                            canvasTheme === 'dark'
                                ? 'bg-black/70 border-neutral-800 text-neutral-300'
                                : 'bg-white border-neutral-200 text-neutral-700 shadow-sm'
                        }`}
                    >
                        <span>{currentUser.username}</span>
                        <button
                            onClick={() => onLogout()}
                            aria-label={language === 'zh' ? '退出登录' : 'Logout'}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                                canvasTheme === 'dark'
                                    ? 'hover:bg-[#D8FF00] hover:text-black'
                                    : 'hover:bg-lime-600 hover:text-white'
                            }`}
                            title="Logout"
                        >
                            <LogOut size={15} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Unsaved Changes Confirmation Modal */}
            {showNewConfirm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-[#0A0A0A] border border-[#D8FF00]/20 rounded-2xl p-6 w-[400px] shadow-2xl">
                        <h3 className="text-lg font-black tracking-[0.08em] uppercase text-[#D8FF00] mb-2">
                            {t(language, 'unsavedChanges')}
                        </h3>

                        <p className="text-neutral-400 text-sm mb-6">
                            {t(language, 'unsavedChangesDesc')}
                        </p>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowNewConfirm(false)}
                                disabled={isSaving}
                                aria-label={t(language, 'cancel')}
                                className="px-4 py-2 rounded-lg bg-black border border-white/10 hover:border-[#D8FF00]/40 text-neutral-300 hover:text-[#D8FF00] text-sm transition-[border-color,color,opacity,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                            >
                                {t(language, 'cancel')}
                            </button>

                            <button
                                onClick={handleDiscardAndNew}
                                disabled={isSaving}
                                aria-label={t(language, 'discard')}
                                className="px-4 py-2 rounded-lg bg-[#FF4D00] hover:bg-orange-500 text-black font-bold text-sm transition-[background-color,opacity,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                            >
                                {t(language, 'discard')}
                            </button>

                            <button
                                onClick={handleSaveAndNew}
                                disabled={isSaving}
                                aria-label={t(language, 'saveAndNew')}
                                className="px-4 py-2 rounded-lg bg-[#D8FF00] hover:bg-[#e4ff3a] text-black font-bold text-sm transition-[background-color,box-shadow,transform,opacity] duration-150 active:scale-[0.98] hover:shadow-[0_0_10px_rgba(216,255,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t(language, 'saving')}
                                    </>
                                ) : (
                                    t(language, 'saveAndNew')
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
