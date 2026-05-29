/**
 * useChatAgent.ts
 * 
 * Custom hook for chat agent interactions.
 * Manages messages, sessions, topics, and API communication.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentCanvasContext } from '../utils/agentCanvasContext';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    media?: {
        type: 'image' | 'video';
        url: string;
    }[]; // Array of media attachments
    hermesRun?: HermesRunPayload;
    timestamp: Date;
}

export interface HermesRunPayload {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    projectCode: string;
    project?: Record<string, unknown> & {
        code?: string;
        name?: string;
        projectName?: string;
        category?: string;
        customer?: string;
        customerName?: string;
        developmentRequirement?: string;
        brief?: string;
        objective?: string;
        craft?: string;
        sizeRequirement?: string;
        quantityRequirement?: string;
        deadline?: string;
    } | null;
    strategy?: {
        selectedModel?: string;
        reason?: string;
        imageCount?: number;
        size?: string;
        mode?: string;
    } | null;
    designTask?: {
        task_type?: string;
        theme?: string;
        prompt?: string;
        negative_prompt?: string;
    } | null;
    projectBrief?: Record<string, unknown> & {
        projectCode?: string;
        projectName?: string;
        customer?: string;
        category?: string;
        craft?: string;
        size?: string;
        quantity?: string;
        deadline?: string;
        designRequirement?: string;
        constraints?: unknown[];
    } | null;
    designStrategy?: {
        theme?: string;
        visualDirection?: string;
        targetUser?: string;
        usageScenario?: string;
        colorPalette?: string[];
        composition?: string;
        styleKeywords?: string[];
        materialAndCraftNotes?: string[];
        avoid?: string[];
    } | null;
    designTasks?: {
        taskId?: string;
        title?: string;
        targetSize?: string;
        purpose?: string;
        structuredPromptDescription?: {
            coreSubjectAndTheme?: string;
            productContextAndUsage?: string;
            artStyleAndMedium?: string;
            colorPaletteAndMood?: string;
            compositionAndLayout?: string;
            detailedVisualElements?: {
                mainFocus?: string;
                backgroundAtmosphere?: string;
                foregroundFraming?: string;
                specificDetailsProps?: string;
            };
            textAndTypography?: string;
            patternProductionConstraints?: string;
            referenceUsage?: string;
            negativeConstraints?: string;
        } | null;
        prompt?: string;
        negativePrompt?: string;
        modelRecommendation?: string;
        alternativeModelRecommendation?: string;
        modelReason?: string;
        referenceRequired?: boolean;
        referenceIds?: string[];
        referenceUsage?: string;
        notes?: unknown[];
    }[];
    references?: {
        images?: {
            id?: string;
            url?: string;
            resolvedUrl?: string;
            rawValue?: string;
            isHttpUrl?: boolean;
            source?: string;
            label?: string;
            role?: string;
            safeToDisplay?: boolean;
            safeToOpen?: boolean;
            field?: string;
            message?: string;
            importedAssetId?: string | null;
        }[];
        links?: {
            id?: string;
            url?: string;
            resolvedUrl?: string;
            rawValue?: string;
            isHttpUrl?: boolean;
            source?: string;
            label?: string;
            type?: string;
            safeToOpen?: boolean;
            field?: string;
            message?: string;
        }[];
        notes?: unknown[];
    } | null;
    expectedDesignTaskCount?: number | null;
    actualDesignTaskCount?: number | null;
    maxDesignsPerGeneration?: number | null;
    countReason?: string | null;
    batchPlan?: {
        totalRequired?: number;
        maxPerBatch?: number;
        totalBatches?: number;
        currentBatch?: number;
        batchLabel?: string;
        remainingCount?: number;
        reason?: string;
    } | null;
    generationReadiness?: {
        readyForImageGeneration?: boolean;
        reason?: string;
    } | null;
    warnings?: {
        code?: string;
        scope?: string;
        message?: string;
    }[];
    assets?: {
        id: string;
        imageId?: string;
        url?: string;
        localUrl?: string;
        sourceUrl?: string;
        model?: string;
        prompt?: string;
    }[];
    errorMessage?: string | null;
    createdAt?: string;
    completedAt?: string;
}

export interface ChatSession {
    id: string;
    topic: string;
    createdAt: string;
    updatedAt?: string;
    messageCount: number;
}

interface UseChatAgentReturn {
    messages: ChatMessage[];
    topic: string | null;
    sessionId: string | null;
    isLoading: boolean;
    error: string | null;
    sessions: ChatSession[];
    isLoadingSessions: boolean;
    sendMessage: (
        content: string,
        media?: { type: 'image' | 'video'; url: string; base64?: string }[],
        canvasContext?: AgentCanvasContext
    ) => Promise<void>;
    startNewChat: () => void;
    loadSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    refreshSessions: () => Promise<void>;
    hasMessages: boolean;
}

interface UseChatAgentOptions {
    onHermesRunReceived?: (hermesRun: HermesRunPayload) => void;
}

interface ApiErrorPayload {
    code?: string;
    message?: string;
    error?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
    return `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatAgentError(payload: ApiErrorPayload, fallback: string): string {
    if (payload.code === 'AGENT_TEXT_MODEL_NOT_CONFIGURED') {
        return 'Agent 文本模型未配置。T8 图像 Key 只负责图片生成，聊天 Agent 需要单独配置文本模型 Key。';
    }

    if (payload.code === 'AGENT_TEXT_MODEL_TIMEOUT') {
        return 'Agent 回复超时，请稍后重试，或切换更快的 AGENT_TEXT_MODEL。';
    }

    if (payload.code === 'AGENT_MEDIA_TOO_LARGE') {
        return payload.message || payload.error || '图片太大，请压缩后再发送。';
    }

    if (payload.code === 'AGENT_INVALID_SESSION_ID' || payload.code === 'AGENT_SESSION_PATH_FORBIDDEN') {
        return payload.message || payload.error || '聊天会话 ID 无效。';
    }

    return payload.message || payload.error || fallback;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
    const payload = await response.json().catch(() => ({} as ApiErrorPayload));
    return formatAgentError(payload, response.statusText || fallback);
}

// ============================================================================
// HOOK
// ============================================================================

export function useChatAgent(options: UseChatAgentOptions = {}): UseChatAgentReturn {
    const { onHermesRunReceived } = options;

    // --- State ---
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [topic, setTopic] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);

    // Use ref to track if we've initialized a session
    const hasInitializedRef = useRef(false);

    // --- Callbacks ---

    /**
     * Initialize a new session if needed
     */
    const ensureSession = useCallback(() => {
        if (!sessionId) {
            const newSessionId = generateSessionId();
            setSessionId(newSessionId);
            return newSessionId;
        }
        return sessionId;
    }, [sessionId]);

    /**
     * Fetch all chat sessions from the server
     */
    const refreshSessions = useCallback(async () => {
        setIsLoadingSessions(true);
        try {
            const response = await fetch('/api/chat/sessions', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                setSessions(data);
            }
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        } finally {
            setIsLoadingSessions(false);
        }
    }, []);

    /**
     * Load a specific session by ID
     */
    const loadSession = useCallback(async (targetSessionId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/chat/sessions/${targetSessionId}`, { credentials: 'include' });
            if (!response.ok) {
                throw new Error(await readApiError(response, 'Session not found'));
            }

            const data = await response.json();

            // Convert messages to ChatMessage format
            const loadedMessages: ChatMessage[] = data.messages.map((msg: any, index: number) => ({
                id: `loaded-${targetSessionId}-${index}`,
                role: msg.role,
                content: msg.content,
                media: msg.media,
                hermesRun: msg.hermesRun,
                timestamp: new Date(msg.timestamp || data.createdAt),
            }));

            setSessionId(targetSessionId);
            setMessages(loadedMessages);
            setTopic(data.topic);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load session';
            setError(errorMessage);
            console.error('Load session error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Delete a session
     */
    const deleteSession = useCallback(async (targetSessionId: string) => {
        try {
            await fetch(`/api/chat/sessions/${targetSessionId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            // Refresh sessions list
            await refreshSessions();

            // If we deleted the current session, start a new one
            if (targetSessionId === sessionId) {
                setMessages([]);
                setTopic(null);
                setSessionId(generateSessionId());
            }
        } catch (err) {
            console.error('Failed to delete session:', err);
        }
    }, [sessionId, refreshSessions]);

    /**
     * Send a message to the chat agent
     */
    const sendMessage = useCallback(async (
        content: string,
        media?: { type: 'image' | 'video'; url: string; base64?: string }[],
        canvasContext?: AgentCanvasContext
    ) => {
        const currentSessionId = ensureSession();
        setError(null);
        setIsLoading(true);

        // Add user message immediately
        const userMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'user',
            content,
            media: media ? media.map(m => ({ type: m.type, url: m.url })) : undefined,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    message: content,
                    media: media ? media.map(m => ({
                        type: m.type,
                        url: m.url,
                        base64: m.base64 || m.url, // Use base64 if available, otherwise URL
                    })) : undefined,
                    canvasContext,
                }),
            });

            if (!response.ok) {
                throw new Error(await readApiError(response, 'Failed to send message'));
            }

            const data = await response.json();

            // Add AI response
            const aiMessage: ChatMessage = {
                id: generateMessageId(),
                role: 'assistant',
                content: data.response,
                hermesRun: data.hermesRun,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMessage]);

            if (data.hermesRun && onHermesRunReceived) {
                try {
                    onHermesRunReceived(data.hermesRun);
                } catch (callbackError) {
                    console.error('[ChatAgent] Failed to handle Hermes run callback:', callbackError);
                }
            }

            // Update topic if returned
            if (data.topic) {
                setTopic(data.topic);
            }

            // Refresh sessions list to show the new/updated session
            await refreshSessions();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
            setError(errorMessage);
            setMessages(prev => [
                ...prev,
                {
                    id: generateMessageId(),
                    role: 'assistant',
                    content: errorMessage,
                    timestamp: new Date(),
                },
            ]);
            console.error('Chat error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [ensureSession, refreshSessions, onHermesRunReceived]);

    /**
     * Start a new chat session
     */
    const startNewChat = useCallback(() => {
        setMessages([]);
        setTopic(null);
        setSessionId(generateSessionId());
        setError(null);
        hasInitializedRef.current = false;
    }, []);

    // Load sessions on mount
    useEffect(() => {
        refreshSessions();
    }, [refreshSessions]);

    return {
        messages,
        topic,
        sessionId,
        isLoading,
        error,
        sessions,
        isLoadingSessions,
        sendMessage,
        startNewChat,
        loadSession,
        deleteSession,
        refreshSessions,
        hasMessages: messages.length > 0,
    };
}

export default useChatAgent;
