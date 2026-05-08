/**
 * CanvasNode.tsx
 * 
 * Main canvas node component.
 * Orchestrates NodeContent, NodeControls, and NodeConnectors sub-components.
 */

import React from 'react';
import { NodeData, NodeStatus, NodeType } from '../../types';
import { Language, t } from '../../i18n/translations';
import { NodeConnectors } from './NodeConnectors';
import { NodeContent } from './NodeContent';
import { NodeControls } from './NodeControls';
import { ChangeAnglePanel } from './ChangeAnglePanel';
import { Scissors } from 'lucide-react';

interface CanvasNodeProps {
  data: NodeData;
  inputUrl?: string;
  connectedImageNodes?: { id: string; url: string; type?: NodeType }[]; // For frame-to-frame video mode and motion control
  onUpdate: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  onAddNext: (id: string, type: 'left' | 'right') => void;
  selected: boolean;
  showControls?: boolean; // Only show controls when single node is selected (not in group selection)
  onSelect: (id: string) => void;
  onNodePointerDown: (e: React.PointerEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onConnectorDown: (e: React.PointerEvent, id: string, side: 'left' | 'right') => void;
  isHoveredForConnection?: boolean;
  onOpenEditor?: (nodeId: string) => void;
  onUpload?: (nodeId: string, imageDataUrl: string) => void;
  onExpand?: (imageUrl: string) => void;
  onDragStart?: (nodeId: string, hasContent: boolean) => void;
  onDragEnd?: () => void;
  // Text node callbacks
  onWriteContent?: (nodeId: string) => void;
  onTextToVideo?: (nodeId: string) => void;
  onTextToImage?: (nodeId: string) => void;
  // Image node callbacks
  onImageToImage?: (nodeId: string) => void;
  onImageToVideo?: (nodeId: string) => void;
  onImageToEditor?: (nodeId: string) => void;
  onRemoveBackground?: (nodeId: string) => void;
  onChangeAngleGenerate?: (nodeId: string) => void;
  zoom: number;
  // Mouse event callbacks for chat panel drag functionality
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  // Theme
  canvasTheme?: 'dark' | 'light';
  language?: Language;

  // Social sharing
  onPostToX?: (nodeId: string, mediaUrl: string, mediaType: 'image' | 'video') => void;
  onPostToTikTok?: (nodeId: string, mediaUrl: string) => void;
}

export const CanvasNode: React.FC<CanvasNodeProps> = ({
  data,
  inputUrl,
  connectedImageNodes,
  onUpdate,
  onGenerate,
  onAddNext,
  selected,
  showControls = true, // Default to true for backward compatibility
  onSelect,
  onNodePointerDown,
  onContextMenu,
  onConnectorDown,
  isHoveredForConnection,
  onOpenEditor,
  onUpload,
  onExpand,
  onDragStart,
  onDragEnd,
  onWriteContent,
  onTextToVideo,
  onTextToImage,
  onImageToImage,
  onImageToVideo,
  onImageToEditor,
  onRemoveBackground,
  onChangeAngleGenerate,
  zoom,
  onMouseEnter,
  onMouseLeave,
  canvasTheme = 'dark',
  language = 'zh',
  onPostToX,
  onPostToTikTok
}) => {
  // ============================================================================
  // STATE
  // ============================================================================

  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editedTitle, setEditedTitle] = React.useState(data.title || data.type);
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isIdle = data.status === NodeStatus.IDLE || data.status === NodeStatus.ERROR;
  const isLoading = data.status === NodeStatus.LOADING;
  const isSuccess = data.status === NodeStatus.SUCCESS;

  // Theme helper
  const isDark = canvasTheme === 'dark';
  const angleAccentTextClass = isDark ? 'text-[#D8FF00]' : 'text-lime-600';
  const angleSelectedRingClass = isDark
    ? 'ring-1 ring-[#D8FF00]/35'
    : 'ring-1 ring-lime-500/30';
  const angleImageRingClass = isDark
    ? 'ring-2 ring-[#D8FF00]/80 shadow-[0_0_12px_rgba(216,255,0,0.10)]'
    : 'ring-2 ring-lime-500 shadow-[0_0_10px_rgba(132,204,22,0.10)]';
  const angleSpinnerClass = isDark ? 'border-[#D8FF00]' : 'border-lime-500';
  const angleActiveButtonClass = isDark
    ? 'bg-[#D8FF00] text-black'
    : 'bg-lime-600 text-white';
  const dragHandleClass = `p-1.5 rounded-full border cursor-grab active:cursor-grabbing transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
    isDark
      ? 'bg-[#D8FF00]/12 text-[#D8FF00] border-[#D8FF00]/25 hover:bg-[#D8FF00] hover:text-black'
      : 'bg-lime-50 text-lime-600 border-lime-200 hover:bg-lime-600 hover:text-white'
  }`;

  const normalizeAngleSettings = (settings?: NodeData['angleSettings'] & { scale?: number }) => ({
    rotation: settings?.rotation ?? 0,
    tilt: settings?.tilt ?? 0,
    zoom: settings?.zoom ?? settings?.scale ?? 0,
    wideAngle: settings?.wideAngle ?? false
  });

  // Inverse scaling for toolbar to keep it readable when zooming out
  // Same logic as NodeControls prompt bar
  const minEffectiveScale = 0.8;
  const effectiveScale = Math.max(zoom, minEffectiveScale);
  const localScale = effectiveScale / zoom;

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Focus input when entering edit mode
  React.useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Update local state when data.title changes
  React.useEffect(() => {
    setEditedTitle(data.title || data.type);
  }, [data.title, data.type]);

  // Auto-detect aspect ratio for legacy images/videos that don't have resultAspectRatio
  React.useEffect(() => {
    // Only detect if we have a result but no stored aspect ratio
    if (!isSuccess || !data.resultUrl || data.resultAspectRatio) return;

    if (data.type === NodeType.VIDEO) {
      // Detect video dimensions
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        if (video.videoWidth && video.videoHeight) {
          onUpdate(data.id, { resultAspectRatio: `${video.videoWidth}/${video.videoHeight}` });
        }
      };
      video.src = data.resultUrl;
    } else {
      // Detect image dimensions
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) {
          onUpdate(data.id, { resultAspectRatio: `${img.naturalWidth}/${img.naturalHeight}` });
        }
      };
      img.src = data.resultUrl;
    }
  }, [isSuccess, data.resultUrl, data.resultAspectRatio, data.type, data.id, onUpdate]);

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getAspectRatioStyle = () => {
    // When there's a successful result, ALWAYS use the result's aspect ratio (lock the node size)
    // This prevents the node from resizing when user selects a different ratio for regeneration
    if (isSuccess && data.resultUrl) {
      // Use stored result aspect ratio if available
      if (data.resultAspectRatio) {
        return { aspectRatio: data.resultAspectRatio };
      }
      // If no stored ratio, use default (shouldn't happen for new content, but handles legacy)
      if (data.type === NodeType.VIDEO) {
        return { aspectRatio: '16/9' };
      }
      // Keep current shape for images without stored ratio (legacy)
      return { aspectRatio: '1/1' };
    }

    // Video nodes without result - use default 16:9
    if (data.type === NodeType.VIDEO) {
      return { aspectRatio: '16/9' };
    }

    // Image nodes without result - use the selected aspect ratio for preview
    const ratio = data.aspectRatio || 'Auto';
    // Auto defaults to 16:9 for video-ready format
    if (ratio === 'Auto') return { aspectRatio: '16/9' };

    const [w, h] = ratio.split(':');
    return { aspectRatio: `${w}/${h}` };
  };

  const handleTitleSave = () => {
    setIsEditingTitle(false);
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== data.type) {
      onUpdate(data.id, { title: trimmed });
    } else if (!trimmed) {
      setEditedTitle(data.title || data.type);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Special rendering for Image Editor node
  if (data.type === NodeType.IMAGE_EDITOR) {
    return (
      <div
        className={`absolute flex items-center group/node touch-none pointer-events-auto`}
        style={{
          transform: `translate(${data.x}px, ${data.y}px)`,
          transition: 'box-shadow 0.2s',
          zIndex: selected ? 50 : 10
        }}
        onPointerDown={(e) => onNodePointerDown(e, data.id)}
        onContextMenu={(e) => onContextMenu(e, data.id)}
      >
        <NodeConnectors nodeId={data.id} onConnectorDown={onConnectorDown} canvasTheme={canvasTheme} />

        {/* Image Editor Node Card */}
        <div
          className={`relative rounded-2xl transition-[border-color,box-shadow,transform] duration-150 flex flex-col ${
            inputUrl
              ? ''
              : isDark
                ? 'bg-[#0f0f0f] border border-neutral-800 shadow-xl'
                : 'bg-white border border-neutral-200 shadow-lg'
          } ${
            selected
              ? isDark
                ? 'ring-2 ring-[#D8FF00]/85 shadow-[0_0_12px_rgba(216,255,0,0.10)]'
                : 'ring-2 ring-lime-500 shadow-[0_0_10px_rgba(132,204,22,0.10)]'
              : ''
          }`}
          style={{
            width: inputUrl ? 'auto' : '340px',
            maxWidth: inputUrl ? '500px' : 'none'
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onOpenEditor) {
              onOpenEditor(data.id);
            }
          }}
        >
          {/* Header */}
          <div className="absolute -top-8 left-0 text-sm px-2 py-0.5 rounded font-medium text-neutral-600">
            {t(language, 'imageEditor')}
          </div>

          {/* Content Area */}
          <div
            className={`flex flex-col items-center justify-center ${inputUrl || data.resultUrl ? 'p-0' : 'p-6'}`}
            style={{ minHeight: inputUrl || data.resultUrl ? 'auto' : '380px' }}
          >
            {inputUrl || data.resultUrl ? (
              <img
                src={data.resultUrl || inputUrl}
                alt="Content"
                className={`rounded-xl w-full h-full object-cover ${
                  selected
                    ? isDark
                      ? 'ring-2 ring-[#D8FF00]/85 shadow-[0_0_12px_rgba(216,255,0,0.10)]'
                      : 'ring-2 ring-lime-500 shadow-[0_0_10px_rgba(132,204,22,0.10)]'
                    : ''
                }`}
                style={{ maxHeight: '500px' }}
                draggable={false}
              />
            ) : (
              <div className="text-neutral-500 text-center text-sm">
                {t(language, 'doubleClickOpenImageEditor')}
              </div>
            )}
          </div>


        </div>
      </div>
    );
  }

  // Special rendering for Camera Angle node (result view)
  if (data.type === NodeType.CAMERA_ANGLE) {
    return (
      <div
        className={`absolute flex items-center group/node touch-none pointer-events-auto`}
        style={{
          transform: `translate(${data.x}px, ${data.y}px)`,
          transition: 'box-shadow 0.2s',
          zIndex: selected ? 50 : 10
        }}
        onPointerDown={(e) => onNodePointerDown(e, data.id)}
        onContextMenu={(e) => onContextMenu(e, data.id)}
      >
        <NodeConnectors nodeId={data.id} onConnectorDown={onConnectorDown} canvasTheme={canvasTheme} />

        {/* Relative wrapper for the Card */}
        <div className="relative group/nodecard">
          {/* Unified Toolbar - Appears above the card on hover */}
          {data.resultUrl && (
            <div
              className="absolute -top-20 left-0 right-0 flex justify-center opacity-0 translate-y-2 group-hover/nodecard:opacity-100 group-hover/nodecard:translate-y-0 transition-[opacity,transform] duration-150 ease-out z-20"
            >
              <div
                style={{
                  transform: `scale(${localScale})`,
                  transformOrigin: 'bottom center'
                }}
              >
                <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900/95 rounded-full border border-neutral-700 shadow-xl backdrop-blur-md">
                {/* Change Angle Button - Re-enable tweaking */}
                <button
                  onClick={() => onUpdate(data.id, {
                    angleMode: !data.angleMode,
                    angleSettings: normalizeAngleSettings(data.angleSettings)
                  })}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${data.angleMode
                    ? angleActiveButtonClass
                    : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'
                    }`}
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  Change Angle
                </button>
                {/* Separator */}
                <div className="w-px h-4 bg-neutral-600 mx-1" />

                {/* Expand Button */}
                <button
                  onClick={() => onExpand?.(data.resultUrl!)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                  title="View full size"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
                {/* Image Editor Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImageToEditor?.(data.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                  title="Image Editor"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                {/* Download Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (data.resultUrl) {
                      const filename = `image_${data.id}.png`;
                      const cleanUrl = data.resultUrl.split('?')[0];
                      if (data.resultUrl.startsWith('data:')) {
                        const link = document.createElement('a');
                        link.href = data.resultUrl;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      } else {
                        fetch(cleanUrl, { cache: 'no-store' })
                          .then(res => res.blob())
                          .then(blob => {
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = filename;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                          })
                          .catch(() => {
                            const link = document.createElement('a');
                            link.href = cleanUrl;
                            link.download = filename;
                            link.target = '_blank';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          });
                      }
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                  title="Download"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                {/* Drag to Chat Handle */}
                <div
                  draggable
                  onPointerDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      nodeId: data.id,
                      url: data.resultUrl,
                      type: 'image'
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                    onDragStart?.(data.id, true);
                  }}
                  onDragEnd={() => onDragEnd?.()}
                  className={dragHandleClass}
                  title="Drag to chat"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="5" r="1" fill="currentColor" />
                    <circle cx="9" cy="12" r="1" fill="currentColor" />
                    <circle cx="9" cy="19" r="1" fill="currentColor" />
                    <circle cx="15" cy="5" r="1" fill="currentColor" />
                    <circle cx="15" cy="12" r="1" fill="currentColor" />
                    <circle cx="15" cy="19" r="1" fill="currentColor" />
                  </svg>
                </div>
                </div>
              </div>
            </div>
          )}

          {/* Node Card */}
          <div
            className={`relative rounded-2xl transition-[border-color,box-shadow,transform] duration-150 flex flex-col ${isDark ? 'bg-[#0f0f0f] border border-neutral-700 shadow-xl' : 'bg-white border border-neutral-200 shadow-lg'} ${selected ? angleSelectedRingClass : ''}`}
            style={{
              width: '340px',
            }}
          >
            {/* Header */}
            <div className={`absolute -top-8 left-0 text-sm px-2 py-0.5 rounded font-medium ${angleAccentTextClass}`}>
              Camera Angle
            </div>

            {/* Content Area */}
            <div
              className={`flex flex-col items-center justify-center ${data.resultUrl ? 'p-0' : 'p-6'}`}
              style={{ minHeight: data.resultUrl ? 'auto' : '340px' }}
            >
              {data.status === NodeStatus.ERROR ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? 'bg-red-500/15 text-red-400 border border-red-500/35' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                      Camera angle generation failed
                    </div>
                    {data.errorMessage && (
                      <div className={`mt-1 max-w-[260px] text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                        {data.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              ) : data.resultUrl ? (
                <img
                  src={data.resultUrl}
                  alt="Content"
                  className={`rounded-xl w-full h-auto object-cover ${selected ? angleImageRingClass : ''}`}
                  draggable={false}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-neutral-500">
                  <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${angleSpinnerClass}`}></div>
                  <span className="text-sm">Generating new angle...</span>
                </div>
              )}
            </div>
          </div>

          {/* Control Panel (Only for re-adjusting angle if needed) */}
          {selected && showControls && data.angleMode && data.resultUrl && (
            <div className="absolute top-[calc(100%+12px)] left-1/2 -translate-x-1/2 flex justify-center z-[100]">
              <div
                style={{
                  transform: `scale(${localScale})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.1s ease-out'
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ChangeAnglePanel
                  imageUrl={data.resultUrl}
                  settings={normalizeAngleSettings(data.angleSettings)}
                  onSettingsChange={(settings) => onUpdate(data.id, { angleSettings: settings })}
                  onClose={() => onUpdate(data.id, { angleMode: false })}
                  onGenerate={onChangeAngleGenerate ? () => onChangeAngleGenerate(data.id) : () => { }}
                  isLoading={isLoading}
                  canvasTheme={canvasTheme}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Special rendering for Video Editor node
  if (data.type === NodeType.VIDEO_EDITOR) {
    // Get video URL from parent node or own resultUrl
    const videoUrl = inputUrl || data.resultUrl;

    return (
      <div
        className={`absolute flex items-center group/node touch-none pointer-events-auto`}
        style={{
          transform: `translate(${data.x}px, ${data.y}px)`,
          transition: 'box-shadow 0.2s',
          zIndex: selected ? 50 : 10
        }}
        onPointerDown={(e) => onNodePointerDown(e, data.id)}
        onContextMenu={(e) => onContextMenu(e, data.id)}
      >
        <NodeConnectors nodeId={data.id} onConnectorDown={onConnectorDown} canvasTheme={canvasTheme} />

        {/* Video Editor Node Card */}
        <div
          className={`relative rounded-2xl transition-[border-color,box-shadow,transform] duration-150 flex flex-col ${videoUrl ? '' : isDark ? 'bg-[#0f0f0f] border border-neutral-700 shadow-xl' : 'bg-white border border-neutral-200 shadow-lg'} ${selected ? 'ring-1 ring-purple-500/30' : ''}`}
          style={{
            width: videoUrl ? 'auto' : '340px',
            maxWidth: videoUrl ? '500px' : 'none'
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onOpenEditor) {
              onOpenEditor(data.id);
            }
          }}
        >
          {/* Header */}
          <div className="absolute -top-8 left-0 text-sm px-2 py-0.5 rounded font-medium text-purple-400">
            Video Editor
          </div>

          {/* Content Area */}
          <div
            className={`flex flex-col items-center justify-center ${videoUrl ? 'p-0' : 'p-6'}`}
            style={{ minHeight: videoUrl ? 'auto' : '380px' }}
          >
            {videoUrl ? (
              <video
                src={videoUrl}
                className={`rounded-xl w-full h-auto object-cover ${selected ? 'ring-2 ring-purple-500/80 shadow-[0_0_12px_rgba(168,85,247,0.12)]' : ''}`}
                style={{ maxHeight: '500px', aspectRatio: '16/9' }}
                muted
                playsInline
                onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                onMouseLeave={(e) => {
                  const video = e.currentTarget as HTMLVideoElement;
                  video.pause();
                  video.currentTime = 0;
                }}
              />
            ) : (
              <div className="text-neutral-500 text-center text-sm">
                <p>Connect a Video node</p>
                <p className="text-xs mt-1 text-neutral-600">Double click to open editor</p>
              </div>
            )}
          </div>

          {/* Trim indicator (if trimmed) */}
          {data.trimStart !== undefined && data.trimEnd !== undefined && (
            <div className="absolute bottom-2 left-2 right-2 bg-black/70 rounded-lg px-2 py-1 text-xs text-purple-300 flex justify-between">
              <span>Trimmed: {data.trimStart.toFixed(1)}s - {data.trimEnd.toFixed(1)}s</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute group/node touch-none pointer-events-auto`}
      style={{
        transform: `translate(${data.x}px, ${data.y}px)`,
        transition: 'box-shadow 0.2s',
        zIndex: selected ? 50 : 10,
        transformOrigin: 'top left'
      }}
      onPointerDown={(e) => onNodePointerDown(e, data.id)}
      onContextMenu={(e) => onContextMenu(e, data.id)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <NodeConnectors nodeId={data.id} onConnectorDown={onConnectorDown} canvasTheme={canvasTheme} />

      {/* Relative wrapper for the Image Card to allow absolute positioning of controls below it */}
      <div className="relative group/nodecard">
        {/* Unified Toolbar - Appears above the card for Image nodes on hover */}
        {data.type === NodeType.IMAGE && isSuccess && data.resultUrl && (
          <div
            className="absolute -top-12 left-0 right-0 flex justify-center opacity-0 translate-y-2 group-hover/nodecard:opacity-100 group-hover/nodecard:translate-y-0 transition-[opacity,transform] duration-150 ease-out z-20"
          >
            <div
              style={{
                transform: `scale(${localScale})`,
                transformOrigin: 'bottom center'
              }}
            >
              <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900/95 rounded-full border border-neutral-700 shadow-xl backdrop-blur-md">
              {/* Change Angle and Upload buttons - Hidden for storyboard-generated scenes */}
              {!(data.prompt && data.prompt.startsWith('Extract panel #')) && (
                <>
                  {/* Change Angle Button */}
                  <button
                    onClick={() => onUpdate(data.id, {
                      angleMode: !data.angleMode,
                      angleSettings: normalizeAngleSettings(data.angleSettings)
                    })}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${data.angleMode
                      ? angleActiveButtonClass
                      : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'
                      }`}
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                    Change Angle
                  </button>
                  {/* Separator */}
                  <div className="w-px h-4 bg-neutral-600 mx-1" />
                  {/* Upload Button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                    title="Upload image"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload
                  </button>
                  {/* Hidden file input for upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onUpload) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const dataUrl = ev.target?.result as string;
                          onUpload(data.id, dataUrl);
                        };
                        reader.readAsDataURL(file);
                      }
                      e.target.value = ''; // Reset for re-upload
                    }}
                  />
                </>
              )}
              {/* Expand Button */}
              <button
                onClick={() => onExpand?.(data.resultUrl!)}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                title="View full size"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              {/* Remove Background Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveBackground?.(data.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 rounded-full border border-[#D8FF00]/30 bg-[#D8FF00]/10 text-[#D8FF00] hover:bg-[#D8FF00]/20 hover:border-[#D8FF00]/60 hover:text-[#D8FF00] transition-colors"
                title="抠除背景"
              >
                <Scissors className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
              {/* Image Editor Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onImageToEditor?.(data.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                title="Open Image Editor"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              {/* Download Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (data.resultUrl) {
                    const filename = `image_${data.id}.png`;
                    const cleanUrl = data.resultUrl.split('?')[0];
                    if (data.resultUrl.startsWith('data:')) {
                      const link = document.createElement('a');
                      link.href = data.resultUrl;
                      link.download = filename;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } else {
                      fetch(cleanUrl, { cache: 'no-store' })
                        .then(res => res.blob())
                        .then(blob => {
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = filename;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(url);
                        })
                        .catch(() => {
                          const link = document.createElement('a');
                          link.href = cleanUrl;
                          link.download = filename;
                          link.target = '_blank';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        });
                    }
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                title="Download"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              {/* Drag to Chat Handle */}
              <div
                draggable
                onPointerDown={(e) => e.stopPropagation()}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify({
                    nodeId: data.id,
                    url: data.resultUrl,
                    type: 'image'
                  }));
                  e.dataTransfer.effectAllowed = 'copy';
                  onDragStart?.(data.id, true);
                }}
                onDragEnd={() => onDragEnd?.()}
                className={dragHandleClass}
                title="Drag to chat"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="5" r="1" fill="currentColor" />
                  <circle cx="9" cy="12" r="1" fill="currentColor" />
                  <circle cx="9" cy="19" r="1" fill="currentColor" />
                  <circle cx="15" cy="5" r="1" fill="currentColor" />
                  <circle cx="15" cy="12" r="1" fill="currentColor" />
                  <circle cx="15" cy="19" r="1" fill="currentColor" />
                </svg>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Toolbar - Appears above the card for Video nodes on hover */}
        {data.type === NodeType.VIDEO && isSuccess && data.resultUrl && (
          <div
            className="absolute -top-20 left-0 right-0 flex justify-center opacity-0 translate-y-2 group-hover/nodecard:opacity-100 group-hover/nodecard:translate-y-0 transition-[opacity,transform] duration-150 ease-out z-20"
          >
            <div
              style={{
                transform: `scale(${localScale})`,
                transformOrigin: 'bottom center'
              }}
            >
              <div className="flex items-center gap-1 px-2 py-1.5 bg-neutral-900/95 rounded-full border border-neutral-700 shadow-xl backdrop-blur-md">
              {/* Expand Button */}
              <button
                onClick={() => onExpand?.(data.resultUrl!)}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                title="View full size"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              {/* Post to X Button */}
              <button
                onClick={(e) => { e.stopPropagation(); onPostToX?.(data.id, data.resultUrl!, 'video'); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                title="Post to X"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </button>
              {/* Post to TikTok Button */}
              <button
                onClick={(e) => { e.stopPropagation(); onPostToTikTok?.(data.id, data.resultUrl!); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                title="Post to TikTok"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                </svg>
              </button>
              {/* Download Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (data.resultUrl) {
                    const filename = `video_${data.id}.mp4`;
                    const cleanUrl = data.resultUrl.split('?')[0];
                    fetch(cleanUrl, { cache: 'no-store' })
                      .then(res => res.blob())
                      .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                      })
                      .catch(() => {
                        const link = document.createElement('a');
                        link.href = cleanUrl;
                        link.download = filename;
                        link.target = '_blank';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      });
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 text-neutral-300 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
                title="Download"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              {/* Drag to Chat Handle */}
              <div
                draggable
                onPointerDown={(e) => e.stopPropagation()}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify({
                    nodeId: data.id,
                    url: data.resultUrl,
                    type: 'video'
                  }));
                  e.dataTransfer.effectAllowed = 'copy';
                  onDragStart?.(data.id, true);
                }}
                onDragEnd={() => onDragEnd?.()}
                className={dragHandleClass}
                title="Drag to chat"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="5" r="1" fill="currentColor" />
                  <circle cx="9" cy="12" r="1" fill="currentColor" />
                  <circle cx="9" cy="19" r="1" fill="currentColor" />
                  <circle cx="15" cy="5" r="1" fill="currentColor" />
                  <circle cx="15" cy="12" r="1" fill="currentColor" />
                  <circle cx="15" cy="19" r="1" fill="currentColor" />
                </svg>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Node Card - Video nodes are wider to fit more controls */}
        <div
          className={`relative ${data.type === NodeType.VIDEO ? 'w-[385px]' : 'w-[365px]'} rounded-2xl border transition-[background-color,border-color,box-shadow] duration-150 flex flex-col shadow-xl ${
            data.hideGenerationControls
              ? 'bg-transparent'
              : isDark
                ? 'bg-[#0f0f0f]'
                : 'bg-white'
          } ${
            selected
              ? isDark
                ? 'border-[#D8FF00]/65 ring-1 ring-[#D8FF00]/35 shadow-[0_0_12px_rgba(216,255,0,0.10)]'
                : 'border-lime-500/65 ring-1 ring-lime-500/30 shadow-[0_0_10px_rgba(132,204,22,0.10)]'
              : isDark
                ? 'border-neutral-800'
                : 'border-neutral-200'
          }`}
        >
          {/* Header (Editable Title) - Positioned horizontally on top-left side */}
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleTitleSave();
                } else if (e.key === 'Escape') {
                  setEditedTitle(data.title || data.type);
                  setIsEditingTitle(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className={`absolute top-2 text-sm px-2 py-0.5 rounded font-medium outline-none whitespace-nowrap ${
                isDark
                  ? 'bg-[#D8FF00]/15 text-[#D8FF00] border border-[#D8FF00]/45 shadow-[0_0_10px_rgba(216,255,0,0.10)]'
                  : 'bg-lime-50 text-lime-700 border border-lime-300 shadow-sm'
              }`}
              style={{ right: 'calc(100% + 8px)', minWidth: '60px' }}
            />
          ) : (
            <div
              className={`absolute top-2 text-sm px-2 py-0.5 rounded font-medium transition-colors cursor-text whitespace-nowrap ${
                selected
                  ? isDark
                    ? 'bg-[#D8FF00]/15 text-[#D8FF00] border border-[#D8FF00]/35 shadow-[0_0_10px_rgba(216,255,0,0.10)]'
                    : 'bg-lime-50 text-lime-700 border border-lime-300 shadow-sm'
                  : isDark
                    ? 'text-neutral-600'
                    : 'text-neutral-500'
              }`}
              style={{ right: 'calc(100% + 8px)' }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              title="Double-click to edit"
            >
              {data.title || data.type}
            </div>
          )}

          {/* Content Area */}
          <NodeContent
            data={data}
            inputUrl={inputUrl}
            selected={selected}
            isIdle={isIdle}
            isLoading={isLoading}
            isSuccess={isSuccess}
            getAspectRatioStyle={getAspectRatioStyle}
            onUpload={onUpload}
            onExpand={onExpand}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onWriteContent={onWriteContent}
            onTextToVideo={onTextToVideo}
            onTextToImage={onTextToImage}
            onImageToImage={onImageToImage}
            onImageToVideo={onImageToVideo}
            onUpdate={onUpdate}
            onPostToX={onPostToX}
          />
        </div>

        {/* Control Panel - Only show when single node is selected (not in group selection) */}
        {/* Hide controls for storyboard-generated scenes */}
        {selected && showControls && data.type !== NodeType.TEXT && !data.hideGenerationControls && !(data.prompt && data.prompt.startsWith('Extract panel #')) && (
          <div className="absolute top-[calc(100%+12px)] left-1/2 -translate-x-1/2 w-[600px] flex justify-center z-[100]">
            <NodeControls
              data={data}
              inputUrl={inputUrl}
              isLoading={isLoading}
              isSuccess={isSuccess}
              connectedImageNodes={connectedImageNodes}
              onUpdate={onUpdate}
              onGenerate={onGenerate}
              onChangeAngleGenerate={onChangeAngleGenerate}
              onSelect={onSelect}
              zoom={zoom}
              canvasTheme={canvasTheme}
              language={language}
            />
          </div>
        )}
      </div>
    </div >
  );
};
