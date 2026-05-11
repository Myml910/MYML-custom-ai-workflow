/**
 * ChatPanel.tsx
 * 
 * Agent chat panel that slides in from the right side.
 * Shows greeting, inspiration suggestions, chat messages, and input.
 * Supports drag-drop of image/video nodes from canvas.
 * Includes chat history panel for viewing past conversations.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, History, Paperclip, Globe, Settings, Send, Sparkles, Plus, Loader2, ChevronLeft, Trash2, MessageSquare } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { useChatAgent, ChatMessage as ChatMessageType, ChatSession } from '../hooks/useChatAgent';
import { Language, t } from '../i18n/translations';

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
}

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
}) => {
    // --- State ---
    const [message, setMessage] = useState('');
    const [showTip, setShowTip] = useState(true);
    const [attachedMedia, setAttachedMedia] = useState<AttachedMedia[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

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

        // Clear input immediately for better UX
        setMessage('');
        setAttachedMedia([]);

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
                : undefined
        );
    };

    const handleNewChat = () => {
        startNewChat();
        setMessage('');
        setAttachedMedia([]);
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
            return 'Yesterday';
        }

        if (diffDays < 7) {
            return `${diffDays} days ago`;
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

    return (
        <div
            className={`fixed top-0 right-0 w-[400px] h-full border-l flex flex-col z-40 shadow-[0_16px_36px_rgba(0,0,0,0.32)] motion-panel-in transition-[background-color,border-color,box-shadow] duration-200 ${
                showHighlight
                    ? isDark
                        ? 'border-neutral-800 ring-2 ring-[#D8FF00]/40'
                        : 'border-lime-500 ring-2 ring-lime-500/35'
                    : isDark
                        ? 'border-neutral-800'
                        : 'border-neutral-200'
            } ${isDark ? 'bg-[#101210]' : 'bg-white'}`}
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
                <div className={`absolute inset-0 z-20 flex flex-col ${isDark ? 'bg-[#101210]' : 'bg-white'}`}>
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
                                                ? 'bg-[#151815] hover:bg-[#1A1D1A] border border-neutral-800 hover:border-[#D8FF00]/25'
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
                            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 flex items-center justify-center gap-2 ${accentButton}`}
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
                                        alt="Drag and drop preview"
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
                                        className={`h-8 px-3 rounded-lg text-sm font-medium transition-colors ${
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
                            <ChatMessage
                                key={msg.id}
                                role={msg.role}
                                content={msg.content}
                                media={msg.media}
                                timestamp={msg.timestamp}
                                canvasTheme={canvasTheme}
                            />
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
                        {error && (
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
                                            alt="Attached"
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
                                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-red-500 hover:bg-red-400 text-white transition-[background-color,transform] duration-150 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
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
            className="fixed bottom-6 right-6 w-12 h-12 bg-[#D8FF00] hover:bg-[#e4ff3a] rounded-xl flex items-center justify-center shadow-[0_8px_20px_rgba(216,255,0,0.12)] hover:shadow-[0_10px_22px_rgba(216,255,0,0.14)] transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black z-50"
        >
            <Sparkles size={22} className="text-black" />
        </button>
    );
};
