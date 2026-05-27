/**
 * agent/index.js
 * 
 * Main entry point for the LangGraph chat agent.
 * Exports the compiled graph and utility functions.
 * 
 * NOTE: Currently implemented in JavaScript/LangGraph.js for simplicity.
 * If more advanced agent capabilities are needed (complex tool chains,
 * multi-agent systems, advanced memory), consider migrating to Python
 * LangGraph which has a more mature and feature-rich ecosystem.
 */

import fs from 'fs';
import path from 'path';
import { createChatGraph, generateTopicTitle } from "./graph/chatGraph.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { CHATS_DIR, IMAGES_DIR } from '../config/paths.js';
import { resolveLibraryUrlToPath } from '../utils/userLibrary.js';
import { sanitizeCanvasContext, summarizeCanvasContext } from './context/canvasContext.js';
import { executeSkill } from './skills/skillRegistry.js';
import { routeCanvasSkillIntent } from './skills/intentRouter.js';

const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const CHAT_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const MEDIA_TOO_LARGE_MESSAGE = "图片太大，请压缩后再发送。";

function createAgentError(code, message, status = 400) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

// ============================================================================
// FILE PATHS
// ============================================================================

// Ensure chats directory exists
if (!fs.existsSync(CHATS_DIR)) {
    fs.mkdirSync(CHATS_DIR, { recursive: true });
}

function assertSafeSessionId(sessionId) {
    if (typeof sessionId !== 'string' || !SAFE_SESSION_ID_PATTERN.test(sessionId)) {
        throw createAgentError(
            'AGENT_INVALID_SESSION_ID',
            'Invalid chat session id.',
            400
        );
    }

    return sessionId;
}

function assertPathInside(baseDir, targetPath) {
    const resolvedBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(targetPath);
    const relative = path.relative(resolvedBase, resolvedTarget);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw createAgentError(
            'AGENT_SESSION_PATH_FORBIDDEN',
            'Chat session path is outside the user chat directory.',
            403
        );
    }

    return resolvedTarget;
}

function estimateBase64Bytes(value) {
    if (typeof value !== 'string') return 0;
    const base64 = value.includes(',') ? value.split(',').pop() || '' : value;
    const normalized = base64.replace(/\s/g, '');
    if (!normalized) return 0;

    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function assertMediaSize(byteLength) {
    if (byteLength > CHAT_MEDIA_MAX_BYTES) {
        throw createAgentError(
            'AGENT_MEDIA_TOO_LARGE',
            MEDIA_TOO_LARGE_MESSAGE,
            413
        );
    }
}

function looksLikeBase64(value) {
    return (
        typeof value === 'string' &&
        value.length > 128 &&
        /^[A-Za-z0-9+/=\s]+$/.test(value)
    );
}

/**
 * Resolve an image URL or base64 to a base64 data URL
 * Handles both file paths (/library/images/...) and data URLs
 */
function resolveImageToBase64(imageInput, user = null) {
    if (!imageInput) return null;

    // Already a base64 data URL
    if (imageInput.startsWith('data:')) {
        assertMediaSize(estimateBase64Bytes(imageInput));
        return imageInput;
    }

    // Handle full URL or path
    let cleanPath = imageInput;
    try {
        if (imageInput.startsWith('http')) {
            const u = new URL(imageInput);
            cleanPath = u.pathname;
        }
    } catch (e) {
        // invalid url, treat as path
    }

    // Decode URI components (e.g., %20 -> space)
    cleanPath = decodeURIComponent(cleanPath);

    // File URL - read from disk
    if (cleanPath.startsWith('/library/')) {
        const filePath = resolveLibraryUrlToPath(cleanPath, user);
        if (filePath && fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            assertMediaSize(stat.size);
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
            return `data:${mimeType};base64,${buffer.toString('base64')}`;
        }
    }

    if (looksLikeBase64(imageInput)) {
        assertMediaSize(estimateBase64Bytes(imageInput));
    }

    // Return as-is if unknown format
    return imageInput;
}

// ============================================================================
// SESSION MANAGEMENT (FILE-BASED)
// ============================================================================

/**
 * In-memory cache for active sessions
 * Sessions are also persisted to disk after each message
 */
const sessionCache = new Map();

/**
 * Convert multimodal content to text representation for serialization
 * This ensures context is preserved without huge base64 data
 */
function contentToText(content) {
    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        const parts = [];
        let imageCount = 0;

        for (const part of content) {
            if (part.type === 'text') {
                parts.push(part.text);
            } else if (part.type === 'image_url') {
                imageCount++;
                parts.push(`[IMAGE ${imageCount} ATTACHED]`);
            }
        }

        return parts.join('\n');
    }

    return JSON.stringify(content);
}

/**
 * Convert LangChain messages to serializable format
 * Multimodal messages are converted to text with [IMAGE ATTACHED] markers
 */
function serializeMessages(messages) {
    return messages.map(msg => ({
        role: msg._getType?.() === 'human' ? 'user' : 'assistant',
        content: contentToText(msg.content),
        media: msg.additional_kwargs?.media,
        hermesRun: msg.additional_kwargs?.hermesRun,
        timestamp: new Date().toISOString()
    }));
}

/**
 * Convert serialized messages back to LangChain format
 * All messages are now stored as text (images converted to markers)
 */
function deserializeMessages(messages) {
    return messages.map(msg => {
        if (msg.role === 'user') {
            const message = new HumanMessage(msg.content);
            if (msg.media) {
                message.additional_kwargs = { media: msg.media };
            }
            return message;
        } else {
            const message = new AIMessage(msg.content);
            if (msg.hermesRun) {
                message.additional_kwargs = { hermesRun: msg.hermesRun };
            }
            return message;
        }
    });
}

/**
 * Get the file path for a session
 */
function getSessionPath(sessionId, chatsDir = CHATS_DIR) {
    const safeSessionId = assertSafeSessionId(sessionId);
    const baseDir = path.resolve(chatsDir || CHATS_DIR);
    return assertPathInside(baseDir, path.join(baseDir, `${safeSessionId}.json`));
}

/**
 * Save a session to disk
 */
function saveSession(sessionId, session, chatsDir = CHATS_DIR) {
    const filePath = getSessionPath(sessionId, chatsDir);
    const data = {
        id: sessionId,
        topic: session.topic,
        createdAt: session.createdAt,
        updatedAt: new Date().toISOString(),
        messages: serializeMessages(session.messages)
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Load a session from disk
 */
function loadSession(sessionId, chatsDir = CHATS_DIR) {
    const filePath = getSessionPath(sessionId, chatsDir);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        return {
            messages: deserializeMessages(data.messages),
            topic: data.topic,
            createdAt: new Date(data.createdAt)
        };
    } catch (err) {
        console.error(`Failed to load session ${sessionId}:`, err);
        return null;
    }
}

/**
 * Get or create a chat session
 * @param {string} sessionId - Unique session identifier
 * @returns {object} Session object
 */
function getScopedSessionCacheKey(sessionId, chatsDir = CHATS_DIR) {
    const safeSessionId = assertSafeSessionId(sessionId);
    return `${path.resolve(chatsDir || CHATS_DIR)}:${safeSessionId}`;
}

export function getSession(sessionId, options = {}) {
    const chatsDir = options.chatsDir || CHATS_DIR;
    const cacheKey = getScopedSessionCacheKey(sessionId, chatsDir);
    // Check cache first
    if (sessionCache.has(cacheKey)) {
        return sessionCache.get(cacheKey);
    }

    // Try to load from disk
    const loaded = loadSession(sessionId, chatsDir);
    if (loaded) {
        sessionCache.set(cacheKey, loaded);
        return loaded;
    }

    // Create new session
    const newSession = {
        messages: [],
        topic: null,
        createdAt: new Date(),
    };
    sessionCache.set(cacheKey, newSession);
    return newSession;
}

/**
 * Delete a chat session
 * @param {string} sessionId - Session to delete
 * @returns {boolean} Whether session existed and was deleted
 */
export function deleteSession(sessionId, options = {}) {
    const chatsDir = options.chatsDir || CHATS_DIR;
    sessionCache.delete(getScopedSessionCacheKey(sessionId, chatsDir));

    const filePath = getSessionPath(sessionId, chatsDir);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
}

/**
 * List all sessions from disk (for chat history)
 * @returns {Array} Array of session summaries
 */
export function listSessions(options = {}) {
    const chatsDir = options.chatsDir || CHATS_DIR;
    if (!fs.existsSync(chatsDir)) {
        return [];
    }

    const files = fs.readdirSync(chatsDir).filter(f => f.endsWith('.json'));
    const sessions = [];

    for (const file of files) {
        try {
            const sessionId = file.slice(0, -'.json'.length);
            if (!SAFE_SESSION_ID_PATTERN.test(sessionId)) {
                continue;
            }

            const filePath = getSessionPath(sessionId, chatsDir);
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            sessions.push({
                id: data.id,
                topic: data.topic || "New Chat",
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                messageCount: data.messages?.length || 0
            });
        } catch (err) {
            console.error(`Failed to read session file ${file}:`, err);
        }
    }

    // Sort by most recent first
    return sessions.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

/**
 * Get full session data (for loading a specific chat)
 * @param {string} sessionId - Session ID
 * @returns {object|null} Full session data with messages
 */
export function getSessionData(sessionId, options = {}) {
    const chatsDir = options.chatsDir || CHATS_DIR;
    const filePath = getSessionPath(sessionId, chatsDir);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`Failed to load session data ${sessionId}:`, err);
        return null;
    }
}

// ============================================================================
// CHAT FUNCTIONS
// ============================================================================

/**
 * Send a message to the chat agent and get a response
 * @param {string} sessionId - Session identifier
 * @param {string} content - User message content
 * @param {Array} media - Optional media attachments [{ type, url, base64 }, ...]
 * @param {string} apiKey - Google AI API key
 * @returns {Promise<object>} { response: string, topic?: string }
 */
export async function sendMessage(sessionId, content, media, apiKey, options = {}) {
    const session = getSession(sessionId, options);
    const graph = createChatGraph();
    const sanitizedCanvasContext = sanitizeCanvasContext(options.canvasContext);
    const canvasContextSummary = summarizeCanvasContext(sanitizedCanvasContext);
    const skillIntent = sanitizedCanvasContext.empty
        ? null
        : routeCanvasSkillIntent(content);
    let canvasSkillResult = null;

    if (skillIntent?.skillName) {
        try {
            canvasSkillResult = await executeSkill(skillIntent.skillName, {
                canvasContext: sanitizedCanvasContext,
                userMessage: content,
            });
            canvasSkillResult.intent = {
                matched: skillIntent.matched,
                matchedText: skillIntent.matchedText,
            };
            console.log(`[Chat] Read-only canvas skill matched: ${skillIntent.skillName}`);
        } catch (error) {
            console.warn(
                `[Chat] Failed to execute read-only canvas skill ${skillIntent.skillName}:`,
                error?.message || error
            );
        }
    }

    // Debug: Log session state
    console.log(`[Chat] Session ${sessionId} has ${session.messages.length} existing messages`);

    // Build the user message content
    let messageContent;
    if (media && Array.isArray(media) && media.length > 0) {
        // Multimodal message with images/videos
        const contentParts = [{ type: "text", text: content || "What do you see in these images?" }];

        for (const m of media) {
            // Resolve file URLs to base64 if needed
            const resolvedBase64 = resolveImageToBase64(m.base64, options.user);
            if (!resolvedBase64) continue;

            const mimeType = m.type === 'video' ? 'video/mp4' : 'image/png';
            // Extract base64 data if it's a data URL
            const base64Data = resolvedBase64.includes(',')
                ? resolvedBase64.split(',')[1]
                : resolvedBase64;

            contentParts.push({
                type: "image_url",
                image_url: {
                    url: `data:${mimeType};base64,${base64Data}`,
                },
            });
        }

        messageContent = contentParts;
    } else {
        messageContent = content;
    }

    // Debug logging


    // Add user message to session
    const userMessage = new HumanMessage(messageContent);

    // Attach metadata for persistence (excluding base64 to save space)
    if (media && Array.isArray(media)) {
        userMessage.additional_kwargs = {
            ...userMessage.additional_kwargs,
            media: media.map(m => {
                // If base64 field contains a URL, preserve it as url
                let url = m.url;
                const b64 = m.base64;
                if (!url && b64 && !b64.startsWith('data:')) {
                    url = b64;
                }
                return { ...m, url, base64: undefined };
            })
        };
    }

    session.messages.push(userMessage);

    console.log(`[Chat] Sending ${session.messages.length} messages to LLM`);

    // Invoke the graph
    const configurable = { apiKey };
    if (canvasContextSummary) {
        configurable.canvasContextSummary = canvasContextSummary;
    }
    if (canvasSkillResult) {
        configurable.canvasSkillResult = canvasSkillResult;
    }

    const result = await graph.invoke(
        { messages: session.messages },
        { configurable }
    );

    // Extract AI response from result
    const aiResponse = result.messages[result.messages.length - 1];
    session.messages.push(aiResponse);

    // Convert the multimodal user message to text for future context
    // This ensures the AI remembers what images contained in subsequent turns
    if (typeof messageContent !== 'string') {
        const textVersion = contentToText(messageContent);
        // Replace the last user message with text version but keep metadata
        const userMsgIndex = session.messages.length - 2;
        const originalMsg = session.messages[userMsgIndex];

        const newMsg = new HumanMessage(textVersion);
        if (originalMsg.additional_kwargs) {
            newMsg.additional_kwargs = originalMsg.additional_kwargs;
        }
        session.messages[userMsgIndex] = newMsg;

        session.messages[userMsgIndex] = newMsg;
    }

    // Generate topic if this is the first exchange (2 messages: user + AI)
    let topic = session.topic;
    if (session.messages.length === 2 && !session.topic) {
        try {
            topic = await generateTopicTitle(session.messages, apiKey);
            session.topic = topic;
        } catch (err) {
            console.error("Failed to generate topic:", err);
            topic = "New Chat";
        }
    }

    // Save session to disk after each message
    saveSession(sessionId, session, options.chatsDir);

    return {
        response: aiResponse.content.toString(),
        topic: topic,
        messageCount: session.messages.length,
    };
}

export function recordHermesExchange(sessionId, content, responseText, hermesRun, options = {}) {
    const session = getSession(sessionId, options);
    const userMessage = new HumanMessage(content || '');
    const aiMessage = new AIMessage(responseText || '');

    if (hermesRun) {
        aiMessage.additional_kwargs = {
            ...aiMessage.additional_kwargs,
            hermesRun
        };
    }

    session.messages.push(userMessage);
    session.messages.push(aiMessage);

    if (!session.topic) {
        session.topic = hermesRun?.projectCode
            ? `Hermes ${hermesRun.projectCode}`
            : 'Hermes Project';
    }

    saveSession(sessionId, session, options.chatsDir);

    return {
        response: aiMessage.content.toString(),
        topic: session.topic,
        messageCount: session.messages.length,
        hermesRun
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { createChatGraph, generateTopicTitle };

export default {
    getSession,
    deleteSession,
    listSessions,
    getSessionData,
    sendMessage,
    recordHermesExchange,
    createChatGraph,
    generateTopicTitle,
};
