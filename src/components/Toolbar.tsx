import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutGrid,
  Image as ImageIcon,
  History,
  Wrench,
  Plus,
  Film
} from 'lucide-react';
import { Language, t } from '../i18n/translations';
import { IconButton } from './ui';

// ============================================================================
// TIKTOK ICON COMPONENT
// ============================================================================

const TikTokIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

// ============================================================================
// TYPES
// ============================================================================

interface ToolbarProps {
  onAddClick?: (e: React.MouseEvent) => void;
  onWorkflowsClick?: (e: React.MouseEvent) => void;
  onHistoryClick?: (e: React.MouseEvent) => void;
  onAssetsClick?: (e: React.MouseEvent) => void;
  onTikTokClick?: (e: React.MouseEvent) => void;
  onStoryboardClick?: (e: React.MouseEvent) => void;
  onToolsOpen?: () => void; // Called when tools dropdown opens to close other panels
  canvasTheme?: 'dark' | 'light';
  language?: Language;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const Toolbar: React.FC<ToolbarProps> = ({
  onAddClick,
  onWorkflowsClick,
  onHistoryClick,
  onAssetsClick,
  onTikTokClick,
  onStoryboardClick,
  onToolsOpen,
  canvasTheme = 'dark',
  language = 'zh'
}) => {
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
    };

    if (isToolsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isToolsOpen]);

  const handleToolClick = (callback?: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => {
    setIsToolsOpen(false);
    callback?.(e);
  };

  // Theme-aware styles
  const isDark = canvasTheme === 'dark';

  return (
    <div
      className={`fixed left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-1.5 rounded-[var(--myml-radius-panel)] shadow-[var(--myml-shadow-floating)] z-50 transition-[background-color,border-color,box-shadow] duration-[var(--myml-motion-base)] ${
        isDark
          ? 'bg-[var(--myml-surface-floating)] border border-[var(--myml-border-default)]'
          : 'bg-white/90 backdrop-blur-sm border border-neutral-200'
      }`}
    >
      <IconButton
        size="lg"
        variant={isDark ? 'primary' : 'secondary'}
        className={`mb-2 ${!isDark ? 'bg-lime-600 text-white hover:bg-lime-500 border-lime-600' : ''}`}
        onClick={onAddClick}
        aria-label={t(language, 'addNodes')}
        title={t(language, 'addNodes')}
      >
        <Plus size={20} />
      </IconButton>

      <div className="flex flex-col gap-3 py-2">
        <IconButton
          variant="ghost"
          className={!isDark ? 'text-neutral-500 hover:bg-neutral-100 hover:text-lime-600' : ''}
          onClick={onWorkflowsClick}
          aria-label={t(language, 'myWorkflows')}
          title={t(language, 'myWorkflows')}
        >
          <LayoutGrid size={20} />
        </IconButton>

        <IconButton
          variant="ghost"
          className={!isDark ? 'text-neutral-500 hover:bg-neutral-100 hover:text-lime-600' : ''}
          title={t(language, 'assets')}
          aria-label={t(language, 'assets')}
          onClick={onAssetsClick}
        >
          <ImageIcon size={20} />
        </IconButton>

        <IconButton
          variant="ghost"
          className={!isDark ? 'text-neutral-500 hover:bg-neutral-100 hover:text-lime-600' : ''}
          onClick={onHistoryClick}
          aria-label={t(language, 'history')}
          title={t(language, 'history')}
        >
          <History size={20} />
        </IconButton>

        {/* Tools Dropdown */}
        <div className="relative" ref={toolsRef}>
          <IconButton
            variant="ghost"
            className={
              isDark
                ? `${isToolsOpen ? 'text-[var(--myml-accent)] bg-[var(--myml-surface-hover)] ring-1 ring-[var(--myml-border-active)]' : ''}`
                : `text-neutral-500 hover:bg-neutral-100 hover:text-lime-600 ${isToolsOpen ? 'text-lime-600 bg-neutral-100' : ''}`
            }
            onClick={() => {
              if (!isToolsOpen) {
                onToolsOpen?.(); // Close other panels when opening tools
              }
              setIsToolsOpen(!isToolsOpen);
            }}
            aria-label={t(language, 'tools')}
            aria-pressed={isToolsOpen}
            title={t(language, 'tools')}
          >
            <Wrench size={20} />
          </IconButton>

          {/* Dropdown Menu */}
          {isToolsOpen && (
            <div
              className={`absolute left-10 top-0 z-50 min-w-[240px] rounded-[var(--myml-radius-card)] border py-2 shadow-[var(--myml-shadow-floating)] motion-menu-in ${
                isDark
                  ? 'bg-[var(--myml-surface-floating)] border-[var(--myml-border-default)]'
                  : 'bg-white border-neutral-200'
              }`}
            >
              <button
                onClick={handleToolClick(onTikTokClick)}
                aria-label={t(language, 'importTikTok')}
                className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                  isDark ? 'hover:bg-[#1A1D1A]' : 'hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    isDark ? 'bg-[#101210] border border-neutral-800 group-hover:border-[#D8FF00]/25' : 'bg-neutral-200'
                  }`}
                >
                  <TikTokIcon size={16} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />
                </div>

                <div className="min-w-0 text-left">
                  <p
                    className={`truncate text-sm font-semibold ${
                      isDark
                        ? 'text-neutral-200 group-hover:text-neutral-100'
                        : 'text-neutral-700 group-hover:text-lime-600'
                    }`}
                  >
                    {t(language, 'importTikTok')}
                  </p>

                  <p className={`truncate text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {t(language, 'importTikTokDesc')}
                  </p>
                </div>
              </button>

              {/* Storyboard Generator */}
              <button
                onClick={handleToolClick(onStoryboardClick)}
                aria-label={t(language, 'storyboardGenerator')}
                className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                  isDark ? 'hover:bg-[#1A1D1A]' : 'hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    isDark ? 'bg-[#101210] border border-neutral-800 group-hover:border-[#D8FF00]/25' : 'bg-neutral-200'
                  }`}
                >
                  <Film size={16} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />
                </div>

                <div className="min-w-0 text-left">
                  <p
                    className={`truncate text-sm font-semibold ${
                      isDark
                        ? 'text-neutral-200 group-hover:text-neutral-100'
                        : 'text-neutral-700 group-hover:text-lime-600'
                    }`}
                  >
                    {t(language, 'storyboardGenerator')}
                  </p>

                  <p className={`truncate text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {t(language, 'storyboardGeneratorDesc')}
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`w-8 h-[1px] my-1 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      <IconButton
        aria-label={t(language, 'profile')}
        className={`mb-2 overflow-hidden rounded-full ${
          isDark
            ? 'border border-[var(--myml-border-default)] hover:border-[var(--myml-border-active)]'
            : 'border border-neutral-300 hover:border-lime-500/60'
        }`}
      >
        <img src="https://picsum.photos/40/40" alt={t(language, 'profile')} className="w-full h-full object-cover" />
      </IconButton>
    </div>
  );
};
