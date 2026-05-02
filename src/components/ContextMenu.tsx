import React, { useEffect, useRef, useState } from 'react';
import {
  Type,
  Image as ImageIcon,
  Video,
  Film,
  PenTool,
  Upload,
  Trash2,
  Plus,
  Undo2,
  Redo2,
  Clipboard,
  Copy,
  Files,
  Layers,
  ChevronRight,
  HardDrive
} from 'lucide-react';
import { ContextMenuState, NodeType } from '../types';
import { Language, t } from '../i18n/translations';

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onSelectType: (type: NodeType | 'DELETE') => void;
  onUpload: (file: File) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPaste?: () => void;
  onCopy?: () => void;
  onDuplicate?: () => void;
  onCreateAsset?: () => void;
  onAddAssets?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  canvasTheme?: 'dark' | 'light';
  language?: Language;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  state,
  onClose,
  onSelectType,
  onUpload,
  onUndo,
  onRedo,
  onPaste,
  onCopy,
  onDuplicate,
  onCreateAsset,
  onAddAssets,
  canUndo = false,
  canRedo = false,
  canvasTheme = 'dark',
  language = 'zh'
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'main' | 'add-nodes'>('main');

  const isDark = canvasTheme === 'dark';
  const isConnector = state.type === 'node-connector';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (state.isOpen && state.type === 'global') {
      setView('main');
    }
  }, [state]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) {
      onUpload(file);
      onClose();
    }

    e.target.value = '';
  };

  const handleUndo = () => {
    if (onUndo && canUndo) {
      onUndo();
      onClose();
    }
  };

  const handleRedo = () => {
    if (onRedo && canRedo) {
      onRedo();
      onClose();
    }
  };

  const handlePaste = () => {
    if (onPaste) {
      onPaste();
      onClose();
    }
  };

  if (!state.isOpen) return null;

  if (state.type === 'node-options') {
    return (
      <div
        ref={menuRef}
        style={{ position: 'absolute', left: state.x, top: state.y, zIndex: 1000 }}
        className={`w-48 border rounded-xl flex flex-col overflow-hidden backdrop-blur-md motion-menu-in transition-all duration-200 ease-out ${
          isDark ? 'bg-[#1e1e1e] border-neutral-800 shadow-[0_18px_45px_rgba(0,0,0,0.42)]' : 'bg-white border-neutral-200 shadow-[0_18px_45px_rgba(15,23,42,0.16)]'
        }`}
      >
        <div className="p-1.5 flex flex-col gap-0.5">
          <MenuItem
            icon={<ImageIcon size={16} />}
            label={t(language, 'createAsset')}
            onClick={() => {
              onCreateAsset?.();
              onClose();
            }}
            disabled={!onCreateAsset}
            canvasTheme={canvasTheme}
          />

          <Divider canvasTheme={canvasTheme} />

          <MenuItem
            icon={<Copy size={16} />}
            label={t(language, 'copy')}
            shortcut="CtrlC"
            onClick={() => {
              onCopy?.();
              onClose();
            }}
            disabled={!onCopy}
            canvasTheme={canvasTheme}
          />

          <MenuItem
            icon={<Clipboard size={16} />}
            label={t(language, 'paste')}
            shortcut="CtrlV"
            onClick={handlePaste}
            disabled={!onPaste}
            canvasTheme={canvasTheme}
          />

          <MenuItem
            icon={<Files size={16} />}
            label={t(language, 'duplicate')}
            onClick={() => {
              onDuplicate?.();
              onClose();
            }}
            disabled={!onDuplicate}
            canvasTheme={canvasTheme}
          />

          <Divider canvasTheme={canvasTheme} />

          <MenuItem
            icon={<Trash2 size={16} />}
            label={t(language, 'delete')}
            shortcut="⌫,del"
            onClick={() => onSelectType('DELETE')}
            canvasTheme={canvasTheme}
          />
        </div>
      </div>
    );
  }

  if (state.type === 'global' && view === 'main') {
    return (
      <div
        ref={menuRef}
        style={{ position: 'absolute', left: state.x, top: state.y, zIndex: 1000 }}
        className={`w-64 border rounded-xl flex flex-col overflow-hidden backdrop-blur-md motion-menu-in transition-all duration-200 ease-out ${
          isDark ? 'bg-[#1e1e1e] border-neutral-800 shadow-[0_18px_45px_rgba(0,0,0,0.42)]' : 'bg-white border-neutral-200 shadow-[0_18px_45px_rgba(15,23,42,0.16)]'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,video/*"
          onChange={handleFileChange}
        />

        <div className="p-1.5 flex flex-col gap-0.5">
          <MenuItem
            icon={<Upload size={16} />}
            label={t(language, 'upload')}
            onClick={handleUploadClick}
            canvasTheme={canvasTheme}
          />

          <MenuItem
            icon={<Layers size={16} />}
            label={t(language, 'addAssets')}
            onClick={() => {
              onAddAssets?.();
              onClose();
            }}
            disabled={!onAddAssets}
            canvasTheme={canvasTheme}
          />

          <Divider canvasTheme={canvasTheme} />

          <MenuItem
            icon={<Plus size={16} />}
            label={t(language, 'addNodes')}
            rightSlot={
              <ChevronRight
                size={14}
                className={isDark ? 'text-neutral-500' : 'text-neutral-400'}
              />
            }
            onClick={() => setView('add-nodes')}
            canvasTheme={canvasTheme}
          />

          <Divider canvasTheme={canvasTheme} />

          <MenuItem
            icon={<Undo2 size={16} />}
            label={t(language, 'undo')}
            shortcut="CtrlZ"
            onClick={handleUndo}
            disabled={!canUndo}
            canvasTheme={canvasTheme}
          />

          <MenuItem
            icon={<Redo2 size={16} />}
            label={t(language, 'redo')}
            shortcut="ShiftCtrlZ"
            onClick={handleRedo}
            disabled={!canRedo}
            canvasTheme={canvasTheme}
          />

          <Divider canvasTheme={canvasTheme} />

          <MenuItem
            icon={<Clipboard size={16} />}
            label={t(language, 'paste')}
            shortcut="CtrlV"
            onClick={handlePaste}
            disabled={!onPaste}
            canvasTheme={canvasTheme}
          />
        </div>
      </div>
    );
  }

  const title = isConnector ? t(language, 'generateFromThisNode') : t(language, 'addNodes');

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        left: state.x,
        top: state.y,
        zIndex: 1000
      }}
      className={`w-64 border rounded-xl flex flex-col overflow-hidden backdrop-blur-md motion-menu-in transition-all duration-200 ease-out ${
        isDark ? 'bg-[#1e1e1e] border-neutral-800 shadow-[0_18px_45px_rgba(0,0,0,0.42)]' : 'bg-white border-neutral-200 shadow-[0_18px_45px_rgba(15,23,42,0.16)]'
      }`}
    >
      <div
        className={`px-4 py-3 text-sm font-medium border-b ${
          isDark ? 'text-neutral-400 border-neutral-800' : 'text-neutral-500 border-neutral-100'
        }`}
      >
        {title}
      </div>

      <div className="p-2 flex flex-col gap-1 max-h-[400px] overflow-y-auto">
        <MenuItem
          icon={<Type size={18} />}
          label={isConnector ? t(language, 'textGeneration') : t(language, 'textNode')}
          desc={isConnector ? t(language, 'textGenerationDesc') : undefined}
          onClick={() => onSelectType(NodeType.TEXT)}
          canvasTheme={canvasTheme}
        />

        <MenuItem
          icon={<ImageIcon size={18} />}
          label={isConnector ? t(language, 'imageGeneration') : t(language, 'imageNode')}
          desc={isConnector ? undefined : t(language, 'imageNodeDesc')}
          onClick={() => onSelectType(NodeType.IMAGE)}
          canvasTheme={canvasTheme}
        />

        <MenuItem
          icon={<Video size={18} />}
          label={isConnector ? t(language, 'videoGeneration') : t(language, 'videoNode')}
          onClick={() => onSelectType(NodeType.VIDEO)}
          canvasTheme={canvasTheme}
        />

        {!isConnector && (
          <MenuItem
            icon={<PenTool size={18} />}
            label={t(language, 'imageEditor')}
            onClick={() => onSelectType(NodeType.IMAGE_EDITOR)}
            canvasTheme={canvasTheme}
          />
        )}

        {!isConnector && (
          <MenuItem
            icon={<Film size={18} />}
            label={t(language, 'videoEditor')}
            onClick={() => onSelectType(NodeType.VIDEO_EDITOR)}
            canvasTheme={canvasTheme}
          />
        )}

        <Divider canvasTheme={canvasTheme} className="my-2 mx-2" />

        <div
          className={`px-2 py-1 text-xs font-medium ${
            isDark ? 'text-neutral-500' : 'text-neutral-400'
          }`}
        >
          {t(language, 'localModels')}
        </div>

        <MenuItem
          icon={<HardDrive size={18} />}
          label={t(language, 'localImageModel')}
          desc={t(language, 'localImageModelDesc')}
          badge={t(language, 'newBadge')}
          onClick={() => onSelectType(NodeType.LOCAL_IMAGE_MODEL)}
          canvasTheme={canvasTheme}
        />

        <MenuItem
          icon={<HardDrive size={18} />}
          label={t(language, 'localVideoModel')}
          desc={t(language, 'localVideoModelDesc')}
          badge={t(language, 'newBadge')}
          onClick={() => onSelectType(NodeType.LOCAL_VIDEO_MODEL)}
          canvasTheme={canvasTheme}
        />
      </div>
    </div>
  );
};

interface DividerProps {
  canvasTheme?: 'dark' | 'light';
  className?: string;
}

const Divider: React.FC<DividerProps> = ({ canvasTheme = 'dark', className = 'my-1 mx-1' }) => {
  return (
    <div
      className={`${className} border-t ${
        canvasTheme === 'dark' ? 'border-neutral-800' : 'border-neutral-100'
      }`}
    />
  );
};

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  badge?: string;
  shortcut?: string;
  active?: boolean;
  rightSlot?: React.ReactNode;
  disabled?: boolean;
  canvasTheme?: 'dark' | 'light';
  onClick: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  label,
  desc,
  badge,
  shortcut,
  active,
  rightSlot,
  disabled,
  canvasTheme = 'dark',
  onClick
}) => {
  const isDark = canvasTheme === 'dark';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group flex items-center gap-3 w-full p-2 rounded-lg text-left transition-all duration-200 ease-out ${
        disabled
          ? isDark
            ? 'opacity-30 cursor-not-allowed'
            : 'opacity-25 cursor-not-allowed'
          : active
            ? isDark
              ? 'bg-[#2a2a2a] text-white'
              : 'bg-neutral-100 text-neutral-900'
            : isDark
              ? 'text-neutral-300 hover:bg-[#2a2a2a] hover:text-white hover:translate-x-[1px]'
              : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 hover:translate-x-[1px]'
      }`}
    >
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ease-out ${
          disabled
            ? 'bg-transparent'
            : active
              ? isDark
                ? 'bg-[#3a3a3a]'
                : 'bg-white'
              : isDark
                ? 'bg-[#151515] group-hover:bg-[#3a3a3a]'
                : 'bg-neutral-100 group-hover:bg-white border border-transparent group-hover:border-neutral-200'
        }`}
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`font-medium text-sm truncate ${disabled && !isDark ? 'text-neutral-400' : ''}`}>
            {label}
          </span>

          <div className="flex items-center gap-2">
            {badge && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  isDark
                    ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
                    : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                }`}
              >
                {badge}
              </span>
            )}

            {shortcut && (
              <span className={`text-xs font-sans ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                {shortcut}
              </span>
            )}

            {rightSlot}
          </div>
        </div>

        {desc && (
          <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
            {desc}
          </p>
        )}
      </div>
    </button>
  );
};
