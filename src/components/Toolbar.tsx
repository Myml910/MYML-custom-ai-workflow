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
      className={`fixed left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-1 rounded-full shadow-2xl z-50 transition-colors duration-300 ${
        isDark
          ? 'bg-black/85 border border-[#D8FF00]/15'
          : 'bg-white/90 backdrop-blur-sm border border-neutral-200'
      }`}
    >
      <button
        className={`w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 transition-all duration-150 mb-2 border ${
          isDark
            ? 'bg-[#D8FF00] text-black border-[#D8FF00] hover:bg-[#D8FF00] hover:text-black hover:shadow-[0_0_18px_rgba(216,255,0,0.65)]'
            : 'bg-neutral-900 text-white hover:bg-neutral-700 border-neutral-900'
        }`}
        onClick={onAddClick}
        title={t(language, 'addNodes')}
      >
        <Plus size={20} />
      </button>

      <div className="flex flex-col gap-4 py-2 px-1">
        <button
          className={`hover:scale-125 transition-all duration-150 ${
            isDark ? 'text-neutral-500 hover:text-[#D8FF00]' : 'text-neutral-500 hover:text-neutral-900'
          }`}
          onClick={onWorkflowsClick}
          title={t(language, 'myWorkflows')}
        >
          <LayoutGrid size={20} />
        </button>

        <button
          className={`hover:scale-125 transition-all duration-150 ${
            isDark ? 'text-neutral-500 hover:text-[#D8FF00]' : 'text-neutral-500 hover:text-neutral-900'
          }`}
          title={t(language, 'assets')}
          onClick={onAssetsClick}
        >
          <ImageIcon size={20} />
        </button>

        <button
          className={`hover:scale-125 transition-all duration-150 ${
            isDark ? 'text-neutral-500 hover:text-[#D8FF00]' : 'text-neutral-500 hover:text-neutral-900'
          }`}
          onClick={onHistoryClick}
          title={t(language, 'history')}
        >
          <History size={20} />
        </button>

        {/* Tools Dropdown */}
        <div className="relative" ref={toolsRef}>
          <button
            className={`hover:scale-125 transition-all duration-150 ${
              isDark
                ? `text-neutral-500 hover:text-[#D8FF00] ${isToolsOpen ? 'text-[#D8FF00]' : ''}`
                : `text-neutral-500 hover:text-neutral-900 ${isToolsOpen ? 'text-neutral-900' : ''}`
            }`}
            onClick={() => {
              if (!isToolsOpen) {
                onToolsOpen?.(); // Close other panels when opening tools
              }
              setIsToolsOpen(!isToolsOpen);
            }}
            title={t(language, 'tools')}
          >
            <Wrench size={20} />
          </button>

          {/* Dropdown Menu */}
          {isToolsOpen && (
            <div
              className={`absolute left-10 top-0 rounded-xl shadow-2xl py-2 min-w-[240px] z-50 ${
                isDark
                  ? 'bg-[#0A0A0A] border border-[#D8FF00]/20'
                  : 'bg-white border border-neutral-200'
              }`}
            >
              <button
                onClick={handleToolClick(onTikTokClick)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors group ${
                  isDark ? 'hover:bg-[#D8FF00]/10' : 'hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isDark ? 'bg-black border border-[#D8FF00]/20' : 'bg-neutral-200'
                  }`}
                >
                  <TikTokIcon size={16} className={isDark ? 'text-[#D8FF00]' : 'text-neutral-700'} />
                </div>

                <div className="text-left">
                  <p
                    className={`text-sm font-semibold ${
                      isDark
                        ? 'text-neutral-200 group-hover:text-[#D8FF00]'
                        : 'text-neutral-700 group-hover:text-neutral-900'
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors group ${
                  isDark ? 'hover:bg-[#D8FF00]/10' : 'hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isDark ? 'bg-black border border-[#D8FF00]/20' : 'bg-neutral-200'
                  }`}
                >
                  <Film size={16} className={isDark ? 'text-[#D8FF00]' : 'text-neutral-700'} />
                </div>

                <div className="text-left">
                  <p
                    className={`text-sm font-semibold ${
                      isDark
                        ? 'text-neutral-200 group-hover:text-[#D8FF00]'
                        : 'text-neutral-700 group-hover:text-neutral-900'
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

      <div className={`w-8 h-[1px] my-1 ${isDark ? 'bg-[#D8FF00]/15' : 'bg-neutral-200'}`} />

      <button
        className={`w-8 h-8 rounded-full overflow-hidden mb-2 hover:scale-110 transition-all duration-150 ${
          isDark
            ? 'border border-[#D8FF00]/25 hover:border-[#D8FF00]/60'
            : 'border border-neutral-300'
        }`}
      >
        <img src="https://picsum.photos/40/40" alt="Profile" className="w-full h-full object-cover" />
      </button>
    </div>
  );
};