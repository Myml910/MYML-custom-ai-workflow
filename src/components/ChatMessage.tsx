/**
 * ChatMessage.tsx
 * 
 * Reusable message bubble component for the chat panel.
 * Displays user and assistant messages with multiple media support.
 * Renders code blocks with copy functionality.
 */

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Language, t } from '../i18n/translations';

// ============================================================================
// TYPES
// ============================================================================

interface ChatMessageProps {
    role: 'user' | 'assistant';
    content: string;
    media?: {
        type: 'image' | 'video';
        url: string;
    }[];
    timestamp?: Date;
    canvasTheme?: 'dark' | 'light';
    language?: Language;
}

interface CodeBlockProps {
    code: string;
    isDark: boolean;
    language: Language;
}

// ============================================================================
// CODE BLOCK COMPONENT
// ============================================================================

const CodeBlock: React.FC<CodeBlockProps> = ({ code, isDark, language }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="relative my-2 group">
            <pre
                className={`border rounded-lg p-3 text-sm overflow-x-auto ${
                    isDark
                        ? 'bg-black/60 border-neutral-700'
                        : 'bg-white/80 border-lime-200'
                }`}
            >
                <code
                    className={`whitespace-pre-wrap break-words ${
                        isDark ? 'text-[#D8FF00]' : 'text-lime-700'
                    }`}
                >
                    {code}
                </code>
            </pre>

            <button
                onClick={handleCopy}
                aria-label={copied ? t(language, 'copiedToClipboard') : t(language, 'copyCodeToClipboard')}
                className={`absolute top-2 right-2 p-1.5 rounded-md transition-[background-color,border-color,opacity] duration-150 opacity-0 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 ${
                    isDark
                        ? 'bg-neutral-800 hover:bg-neutral-700'
                        : 'bg-neutral-100 hover:bg-neutral-200 border border-neutral-200'
                }`}
                title={copied ? t(language, 'copied') : t(language, 'copyToClipboard')}
            >
                {copied ? (
                    <Check size={14} className="text-green-400" />
                ) : (
                    <Copy size={14} className={isDark ? 'text-neutral-300' : 'text-neutral-600'} />
                )}
            </button>
        </div>
    );
};

// ============================================================================
// CONTENT PARSER
// ============================================================================

function parseContent(content: string): Array<{ type: 'text' | 'code'; content: string }> {
    const segments: Array<{ type: 'text' | 'code'; content: string }> = [];

    // Regex to match code blocks (```...``` or ```language\n...```)
    const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;

    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            const text = content.slice(lastIndex, match.index).trim();

            if (text) {
                segments.push({ type: 'text', content: text });
            }
        }

        segments.push({ type: 'code', content: match[1].trim() });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        const text = content.slice(lastIndex).trim();

        if (text) {
            segments.push({ type: 'text', content: text });
        }
    }

    if (segments.length === 0) {
        segments.push({ type: 'text', content });
    }

    return segments;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChatMessage: React.FC<ChatMessageProps> = ({
    role,
    content,
    media,
    timestamp,
    canvasTheme = 'dark',
    language = 'zh',
}) => {
    const isUser = role === 'user';
    const isDark = canvasTheme === 'dark';

    // Clean content and parse code blocks
    const cleanedContent = content.replace(/\[IMAGE \d+ ATTACHED\]/g, '').trim();
    const segments = parseContent(cleanedContent);

    const userBubbleClass = isDark
        ? 'bg-[#D8FF00] text-black rounded-br-md shadow-[0_0_18px_rgba(216,255,0,0.18)]'
        : 'bg-lime-500 text-white rounded-br-md shadow-[0_8px_20px_rgba(132,204,22,0.18)]';

    const assistantBubbleClass = isDark
        ? 'bg-neutral-900 text-neutral-100 rounded-bl-md border border-neutral-800'
        : 'bg-neutral-100 text-neutral-900 rounded-bl-md border border-neutral-200';

    const timestampClass = isUser
        ? isDark
            ? 'text-black/55'
            : 'text-white/75'
        : isDark
            ? 'text-neutral-500'
            : 'text-neutral-400';

    const mediaBorderClass = isUser
        ? isDark
            ? 'border-black/15'
            : 'border-white/30'
        : isDark
            ? 'border-neutral-700'
            : 'border-neutral-200';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
            <div
                className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    isUser ? userBubbleClass : assistantBubbleClass
                }`}
            >
                {/* Media Attachments */}
                {media && media.length > 0 && (
                    <div className={`mb-2 ${media.length > 1 ? 'grid grid-cols-2 gap-2' : ''}`}>
                        {media.map((m, index) => (
                            <div key={index} className="relative">
                                {m.type === 'image' ? (
                                    <img
                                        src={m.url}
                                        alt={`${t(language, 'attachedMedia')} ${index + 1}`}
                                        className={`w-full max-h-32 rounded-lg object-cover border ${mediaBorderClass}`}
                                    />
                                ) : (
                                    <video
                                        src={m.url}
                                        className={`w-full max-h-32 rounded-lg object-cover border ${mediaBorderClass}`}
                                        controls
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Message Content with Code Blocks */}
                <div className="text-sm leading-relaxed select-text cursor-text">
                    {segments.map((segment, index) => (
                        segment.type === 'code' ? (
                            <CodeBlock key={index} code={segment.content} isDark={isDark} language={language} />
                        ) : (
                            <div key={index} className="whitespace-pre-wrap">
                                {segment.content}
                            </div>
                        )
                    ))}
                </div>

                {/* Timestamp */}
                {timestamp && (
                    <div className={`text-[10px] mt-1 ${timestampClass}`}>
                        {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatMessage;
