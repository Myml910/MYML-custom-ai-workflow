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
    const accentBorder = isDark ? 'border-[#D8FF00]' : 'border-lime-500';
    const accentBgSoft = isDark ? 'bg-[#D8FF00]/10' : 'bg-lime-100/70';
    const accentButton = isDark
        ? 'bg-[#D8FF00] hover:bg-[#C8EE00] text-black shadow-[0_0_10px_rgba(216,255,0,0.14)]'
        : 'bg-lime-500 hover:bg-lime-400 text-white shadow-[0_6px_16px_rgba(132,204,22,0.16)]';

    const iconButtonClass = isDark
        ? 'hover:bg-neutral-800 text-neutral-400 hover:text-[#D8FF00] transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35'
        : 'hover:bg-neutral-100 text-neutral-500 hover:text-lime-600 transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/35';

    const inputIconButtonClass = isDark
        ? 'hover:bg-neutral-800 text-neutral-400 hover:text-[#D8FF00] transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35'
        : 'hover:bg-neutral-200 text-neutral-500 hover:text-lime-600 transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/35';

    const isSendDisabled = isLoading || (!message.trim() && attachedMedia.length === 0);

    return (
        <div
            className={`fixed top-0 right-0 w-[400px] h-full border-l flex flex-col z-40 shadow-xl motion-panel-in transition-[background-color,border-color,box-shadow] duration-200 ${
                showHighlight
                    ? `${accentBorder} border-2`
                    : isDark
                        ? 'border-neutral-800'
                        : 'border-neutral-200'
            } ${isDark ? 'bg-[#121212]' : 'bg-white'}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Drag Overlay */}
            {showHighlight && (
                <div className={`absolute inset-0 ${accentBgSoft} pointer-events-none z-10 flex items-center justify-center`}>
                    <div
                        className={`border-2 border-dashed rounded-2xl px-8 py-6 text-center ${
                            isDark
                                ? 'bg-[#D8FF00]/12 border-[#D8FF00]/60 shadow-[0_0_16px_rgba(216,255,0,0.10)]'
                                : 'bg-lime-50 border-lime-400 shadow-[0_6px_18px_rgba(132,204,22,0.12)]'
                        }`}
                    >
                        <Sparkles className={`w-10 h-10 mx-auto mb-2 ${accentText}`} />
                        <p className={`${accentText} font-medium`}>Drop image/video here</p>
                    </div>
                </div>
            )}

            {/* History Panel */}
            {showHistory && (
                <div className={`absolute inset-0 z-20 flex flex-col ${isDark ? 'bg-[#121212]' : 'bg-white'}`}>
                    {/* History Header */}
                    <div className={`flex items-center gap-3 px-4 py-3 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                        <button
                            onClick={() => setShowHistory(false)}
                            aria-label="Back to chat"
                            className={`p-1.5 rounded-lg transition-colors ${iconButtonClass}`}
                        >
                            <ChevronLeft size={18} />
                        </button>

                        <span className={`font-medium text-sm ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                            Chat History
                        </span>
                    </div>

                    {/* History List */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {isLoadingSessions ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className={`w-6 h-6 animate-spin ${accentText}`} />
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="text-center py-8">
                                <MessageSquare className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-neutral-600' : 'text-neutral-300'}`} />
                                <p className="text-neutral-500 text-sm">No chat history yet</p>
                                <p className={`${isDark ? 'text-neutral-600' : 'text-neutral-400'} text-xs mt-1`}>
                                    Start a conversation to see it here
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
                                        aria-label={`Open chat: ${session.topic}`}
                                        className={`w-full text-left p-3 rounded-xl transition-[background-color,border-color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 group cursor-pointer ${
                                            isDark
                                                ? 'bg-neutral-900/70 hover:bg-neutral-800 border border-transparent hover:border-[#D8FF00]/20'
                                                : 'bg-neutral-100 hover:bg-lime-50 border border-transparent hover:border-lime-200'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                                                    {session.topic}
                                                </p>
                                                <p className={`text-xs mt-1 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                                                    {session.messageCount} messages · {formatDate(session.updatedAt || session.createdAt)}
                                                </p>
                                            </div>

                                            <button
                                                onClick={(e) => handleDeleteSession(e, session.id)}
                                                aria-label={`Delete chat: ${session.topic}`}
                                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-lg transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 text-neutral-500 hover:text-red-400"
                                                title="Delete chat"
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
                            aria-label="New chat"
                            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 flex items-center justify-center gap-2 ${accentButton}`}
                        >
                            <Plus size={16} />
                            New Chat
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                    <span className={`font-medium text-sm truncate max-w-[180px] ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                        {topic || (hasMessages ? 'New Chat' : 'ImageIdeas')}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {hasMessages && (
                        <button
                            onClick={handleNewChat}
                            className={`p-1.5 rounded-lg ${iconButtonClass}`}
                            aria-label="New chat"
                            title="New Chat"
                        >
                            <Plus size={18} />
                        </button>
                    )}

                    <button
                        onClick={() => setShowHistory(true)}
                        className={`p-1.5 rounded-lg ${iconButtonClass}`}
                        aria-label="Open chat history"
                        aria-pressed={showHistory}
                        title="Chat History"
                    >
                        <History size={18} />
                    </button>

                    <button
                        onClick={onClose}
                        aria-label="Close chat"
                        className={`p-1.5 rounded-lg ${iconButtonClass}`}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className={`flex-1 overflow-y-auto p-6 ${isDark ? 'bg-[#121212]' : 'bg-white'}`}>
                {!hasMessages ? (
                    <>
                        {/* Greeting */}
                        <h1 className={`text-2xl font-bold mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                            Hi, {userName}
                        </h1>

                        <p className={`${accentText} text-lg mb-6`}>
                            Looking for inspiration?
                        </p>

                        {/* Tip Card */}
                        {showTip && (
                            <div
                                className={`rounded-2xl p-4 mb-4 border ${
                                    isDark
                                        ? 'bg-neutral-900/70 border-neutral-800'
                                        : 'bg-neutral-50 border-neutral-200'
                                }`}
                            >
                                <div
                                    className={`rounded-xl overflow-hidden mb-3 flex items-center justify-center ${
                                        isDark ? 'bg-neutral-800/70' : 'bg-neutral-100'
                                    }`}
                                >
                                    <img
                                        src="/chat-preview.gif"
                                        alt="Drag and drop preview"
                                        className="w-full h-auto object-cover rounded-xl"
                                    />
                                </div>

                                <p className={`text-sm leading-relaxed mb-3 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                                    Drag image/video nodes into the chat dialog to unlock advanced features like prompt generation based on node content, providing more inspiration for your creativity~
                                </p>

                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setShowTip(false)}
                                        aria-label="Dismiss chat tip"
                                        className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                                            isDark
                                                ? 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
                                                : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-900'
                                        }`}
                                    >
                                        Got it
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
                                <div className={`rounded-2xl rounded-bl-md px-4 py-3 ${isDark ? 'bg-neutral-900 border border-neutral-800' : 'bg-neutral-100'}`}>
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
            <div className={`p-4 border-t ${isDark ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-white'}`}>
                <div
                    className={`rounded-2xl p-3 border ${
                        isDark
                            ? 'bg-neutral-900 border-neutral-800 focus-within:border-[#D8FF00]/45 focus-within:shadow-[0_0_12px_rgba(216,255,0,0.06)]'
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
                                        aria-label={`Remove attached ${media.type}`}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center text-white text-[10px] transition-[background-color,transform] duration-150 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
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
                        placeholder="Start your journey of inspiration"
                        className={`w-full bg-transparent text-sm outline-none mb-3 resize-none min-h-[24px] max-h-[120px] ${
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
                                className={`p-1.5 rounded-lg ${inputIconButtonClass}`}
                                aria-label="Attach media"
                            >
                                <Paperclip size={16} />
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                className={`p-1.5 rounded-lg ${inputIconButtonClass}`}
                                aria-label="Web search"
                            >
                                <Globe size={16} />
                            </button>

                            <button
                                className={`p-1.5 rounded-lg ${inputIconButtonClass}`}
                                aria-label="Chat settings"
                            >
                                <Settings size={16} />
                            </button>

                            <button
                                onClick={handleSend}
                                disabled={isSendDisabled}
                                aria-label="Send message"
                                className={`p-2 rounded-full transition-[background-color,color,box-shadow,transform,opacity] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 ${
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
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ onClick, isOpen }) => {
    if (isOpen) return null;

    return (
        <button
            onClick={onClick}
            aria-label="Open chat"
            aria-pressed={isOpen}
            className="fixed bottom-6 right-6 w-12 h-12 bg-[#D8FF00] hover:bg-[#e4ff3a] rounded-full flex items-center justify-center shadow-[0_8px_20px_rgba(216,255,0,0.14)] hover:shadow-[0_10px_24px_rgba(216,255,0,0.18)] transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black z-50"
        >
            <Sparkles size={22} className="text-black" />
        </button>
    );
};
