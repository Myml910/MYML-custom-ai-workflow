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
      className={`fixed left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-1.5 rounded-xl shadow-[0_14px_32px_rgba(0,0,0,0.32)] z-50 transition-[background-color,border-color,box-shadow] duration-150 ${
        isDark
          ? 'bg-[#101210]/95 border border-neutral-800'
          : 'bg-white/90 backdrop-blur-sm border border-neutral-200'
      }`}
    >
      <button
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black mb-2 border ${
          isDark
            ? 'bg-[#D8FF00] text-black border-[#D8FF00]/80 hover:bg-[#e4ff3a] hover:shadow-[0_0_8px_rgba(216,255,0,0.12)]'
            : 'bg-lime-600 text-white hover:bg-lime-500 border-lime-600'
        }`}
        onClick={onAddClick}
        aria-label={t(language, 'addNodes')}
        title={t(language, 'addNodes')}
      >
        <Plus size={20} />
      </button>

      <div className="flex flex-col gap-3 py-2">
        <button
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
            isDark ? 'text-neutral-500 hover:bg-[#1A1D1A] hover:text-neutral-100' : 'text-neutral-500 hover:bg-neutral-100 hover:text-lime-600'
          }`}
          onClick={onWorkflowsClick}
          aria-label={t(language, 'myWorkflows')}
          title={t(language, 'myWorkflows')}
        >
          <LayoutGrid size={20} />
        </button>

        <button
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
            isDark ? 'text-neutral-500 hover:bg-[#1A1D1A] hover:text-neutral-100' : 'text-neutral-500 hover:bg-neutral-100 hover:text-lime-600'
          }`}
          title={t(language, 'assets')}
          aria-label={t(language, 'assets')}
          onClick={onAssetsClick}
        >
          <ImageIcon size={20} />
        </button>

        <button
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
            isDark ? 'text-neutral-500 hover:bg-[#1A1D1A] hover:text-neutral-100' : 'text-neutral-500 hover:bg-neutral-100 hover:text-lime-600'
          }`}
          onClick={onHistoryClick}
          aria-label={t(language, 'history')}
          title={t(language, 'history')}
        >
          <History size={20} />
        </button>

        {/* Tools Dropdown */}
        <div className="relative" ref={toolsRef}>
          <button
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
              isDark
                ? `text-neutral-500 hover:bg-[#1A1D1A] hover:text-neutral-100 ${isToolsOpen ? 'text-[#D8FF00] bg-[#1A1D1A] ring-1 ring-[#D8FF00]/35' : ''}`
                : `text-neutral-500 hover:bg-neutral-100 hover:text-lime-600 ${isToolsOpen ? 'text-lime-600 bg-neutral-100' : ''}`
            }`}
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
          </button>

          {/* Dropdown Menu */}
          {isToolsOpen && (
            <div
              className={`absolute left-10 top-0 rounded-lg shadow-[0_14px_32px_rgba(0,0,0,0.36)] py-2 min-w-[240px] z-50 motion-menu-in border ${
                isDark
                  ? 'bg-[#151815] border-neutral-800'
                  : 'bg-white border-neutral-200'
              }`}
            >
              <button
                onClick={handleToolClick(onTikTokClick)}
                aria-label={t(language, 'importTikTok')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-[background-color,color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 group ${
                  isDark ? 'hover:bg-[#1A1D1A]' : 'hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center ${
                    isDark ? 'bg-[#101210] border border-neutral-800 group-hover:border-[#D8FF00]/25' : 'bg-neutral-200'
                  }`}
                >
                  <TikTokIcon size={16} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />
                </div>

                <div className="text-left">
                  <p
                    className={`text-sm font-semibold ${
                      isDark
                        ? 'text-neutral-200 group-hover:text-neutral-100'
                        : 'text-neutral-700 group-hover:text-lime-600'
                    }`}
                  >
                    {t(language, 'importTikTok')}
                  </p>

                  <p className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {t(language, 'importTikTokDesc')}
                  </p>
                </div>
              </button>

              {/* Storyboard Generator */}
              <button
                onClick={handleToolClick(onStoryboardClick)}
                aria-label={t(language, 'storyboardGenerator')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-[background-color,color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 group ${
                  isDark ? 'hover:bg-[#1A1D1A]' : 'hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center ${
                    isDark ? 'bg-[#101210] border border-neutral-800 group-hover:border-[#D8FF00]/25' : 'bg-neutral-200'
                  }`}
                >
                  <Film size={16} className={isDark ? 'text-[#D8FF00]' : 'text-lime-600'} />
                </div>

                <div className="text-left">
                  <p
                    className={`text-sm font-semibold ${
                      isDark
                        ? 'text-neutral-200 group-hover:text-neutral-100'
                        : 'text-neutral-700 group-hover:text-lime-600'
                    }`}
                  >
                    {t(language, 'storyboardGenerator')}
                  </p>

                  <p className={`text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {t(language, 'storyboardGeneratorDesc')}
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`w-8 h-[1px] my-1 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

      <button
        aria-label={t(language, 'profile')}
        className={`w-8 h-8 rounded-full overflow-hidden mb-2 transition-[border-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
          isDark
            ? 'border border-neutral-800 hover:border-[#D8FF00]/35'
            : 'border border-neutral-300 hover:border-lime-500/60'
        }`}
      >
        <img src="https://picsum.photos/40/40" alt={t(language, 'profile')} className="w-full h-full object-cover" />
      </button>
    </div>
  );
};
