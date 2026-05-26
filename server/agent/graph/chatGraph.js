/**
 * chatGraph.js
 *
 * LangGraph state graph for the chat agent.
 * Defines the workflow: receives messages → processes with LLM → returns response.
 *
 * APIMart /responses is preferred when configured. Legacy OpenAI-compatible
 * Chat Completions remains as fallback.
 */

import { StateGraph, MessagesAnnotation, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { CHAT_AGENT_SYSTEM_PROMPT, TOPIC_GENERATION_PROMPT } from "../prompts/system.js";
import { createTextResponse, extractResponseText } from "../../services/ai/providers/apimartProvider.js";
import { createAgentChatError, getAgentChatConfig } from "../config/chatConfig.js";

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

function getMessageRole(message) {
    const type = message._getType?.();

    if (type === "system") return "system";
    if (type === "human") return "user";
    if (type === "ai") return "assistant";

    return "user";
}

function normalizeMessageContent(content) {
    if (typeof content === "string") {
        return content;
    }

    if (Array.isArray(content)) {
        const parts = [];

        for (const part of content) {
            if (!part) continue;

            if (part.type === "text") {
                parts.push({
                    type: "text",
                    text: part.text || "",
                });
                continue;
            }

            if (part.type === "image_url" && part.image_url?.url) {
                parts.push({
                    type: "image_url",
                    image_url: {
                        url: part.image_url.url,
                    },
                });
                continue;
            }

            parts.push({
                type: "text",
                text: typeof part === "string" ? part : JSON.stringify(part),
            });
        }

        return parts.length > 0 ? parts : "";
    }

    return String(content ?? "");
}

function toOpenAICompatibleMessages(messages) {
    return messages.map(message => ({
        role: getMessageRole(message),
        content: normalizeMessageContent(message.content),
    }));
}

function formatCanvasSkillResult(canvasSkillResult) {
    if (!canvasSkillResult) return "";

    const result = canvasSkillResult.result ?? {};
    const serializedResult = JSON.stringify(result, null, 2);

    return `Read-only canvas skill result for this turn:

Skill: ${canvasSkillResult.name}
Description: ${canvasSkillResult.description || "No description"}
Read-only: ${canvasSkillResult.readOnly === true ? "true" : "false"}

Use this result to answer the user's canvas question naturally.
Do not dump raw JSON unless the user explicitly asks for JSON.
Canvas skills are read-only and cannot create nodes, move nodes, delete nodes, save workflows, run generation, or modify canvas state.
If the user asked for an action, explain that you can only analyze the current canvas and provide suggested steps.

Result:
${serializedResult}`;
}

async function callChatCompletions({
    messages,
    apiKey,
    baseUrl,
    model,
    reasoningEffort,
    provider = "legacy",
    timeoutMs,
    temperature = 0.7,
    maxTokens = 2048,
    includeProviderParams = false,
}) {
    if (!apiKey) {
        throw createAgentChatError(
            "AGENT_TEXT_MODEL_NOT_CONFIGURED",
            "Agent text model is not configured. Configure AGENT_CHAT_PROVIDER=t8 with AGENT_CHAT_API_KEY, or configure APIMART_API_KEY or CHAT_API_KEY/OPENAI_API_KEY.",
            503
        );
    }

    const url = `${baseUrl}/chat/completions`;

    const body = {
        model,
        messages,
        stream: false,
    };

    if (provider !== "t8" || includeProviderParams) {
        body.temperature = temperature;
        body.max_tokens = maxTokens;
    }

    if (provider !== "t8") {
        // Your third-party gateway says reasoning_effort supports:
        // none / low / medium / high.
        // If it is set to none, do not send it.
        if (reasoningEffort && reasoningEffort !== "none") {
            body.reasoning_effort = reasoningEffort;
        }
    }

    console.log(`[ChatGraph] Calling ${provider} ${url}`);
    console.log(`[ChatGraph] Model: ${model}`);

    const controller = new AbortController();
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === "AbortError") {
            throw createAgentChatError(
                "AGENT_TEXT_MODEL_TIMEOUT",
                `${provider} chat completion timed out after ${timeoutMs}ms.`,
                504
            );
        }
        throw createAgentChatError(
            "AGENT_TEXT_MODEL_PROVIDER_ERROR",
            `${provider} chat completion request failed: ${error?.message || error}`,
            502
        );
    } finally {
        if (timeout) clearTimeout(timeout);
    }

    const rawText = await response.text();

    let data;
    let parsedJson = true;
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
        parsedJson = false;
        data = { message: rawText.slice(0, 500) };
    }

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.message ||
            response.statusText ||
            "Chat API request failed";

        let code = "AGENT_TEXT_MODEL_PROVIDER_ERROR";
        if (response.status === 401 || response.status === 403) {
            code = "AGENT_TEXT_MODEL_AUTH_ERROR";
        } else if (response.status === 402) {
            code = "AGENT_TEXT_MODEL_PAYMENT_REQUIRED";
        } else if (response.status === 429) {
            code = "AGENT_TEXT_MODEL_RATE_LIMIT";
        }

        throw createAgentChatError(
            code,
            `${provider} chat completion failed: ${message}`,
            response.status
        );
    }

    if (!parsedJson) {
        throw createAgentChatError(
            "AGENT_TEXT_MODEL_PROVIDER_ERROR",
            `${provider} chat API returned non-JSON response: ${rawText.slice(0, 500)}`,
            502
        );
    }

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === "string") {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (typeof part === "string") return part;
                if (part?.text) return part.text;
                return "";
            })
            .join("")
            .trim();
    }

    return "";
}

async function callTextModel({
    messages,
    chatConfig,
    temperature = 0.7,
    maxTokens = 2048,
    includeProviderParams = false,
}) {
    if (chatConfig.provider === "apimart") {
        console.log("[ChatGraph] Calling APIMart /responses");
        console.log(`[ChatGraph] Model: ${chatConfig.aiConfig.apimart.textModel}`);

        const data = await createTextResponse(messages, {
            config: chatConfig.aiConfig,
            model: chatConfig.aiConfig.apimart.textModel,
            temperature,
            maxTokens
        });

        return extractResponseText(data);
    }

    return await callChatCompletions({
        messages,
        apiKey: chatConfig.apiKey,
        baseUrl: chatConfig.baseUrl,
        model: chatConfig.model,
        reasoningEffort: chatConfig.reasoningEffort,
        provider: chatConfig.provider,
        timeoutMs: chatConfig.timeoutMs,
        temperature,
        maxTokens,
        includeProviderParams,
    });
}

export async function callOneShotAgentChat({
    messages,
    runtimeApiKey,
    provider,
    model,
    baseUrl,
    apiKey,
    timeoutMs,
    temperature = 0.2,
    maxTokens = 2048,
    includeProviderParams = false,
} = {}) {
    const hasOverrides = Boolean(provider || model || baseUrl || apiKey || timeoutMs);
    let chatConfig;

    if (hasOverrides) {
        try {
            chatConfig = getAgentChatConfig({ runtimeApiKey });
        } catch (error) {
            if (!apiKey) {
                throw error;
            }
            chatConfig = {};
        }

        chatConfig = {
            ...chatConfig,
            provider: provider || chatConfig.provider || 't8',
            model: model || chatConfig.model,
            baseUrl: baseUrl || chatConfig.baseUrl,
            apiKey: apiKey || chatConfig.apiKey,
            timeoutMs: timeoutMs || chatConfig.timeoutMs,
        };
    } else {
        chatConfig = getAgentChatConfig({ runtimeApiKey });
    }

    return await callTextModel({
        messages,
        chatConfig,
        temperature,
        maxTokens,
        includeProviderParams,
    });
}

// ============================================================================
// GRAPH NODES
// ============================================================================

async function agentNode(state, config) {
    const chatConfig = getAgentChatConfig({
        runtimeApiKey: config.configurable?.apiKey,
    });
    const canvasContextSummary = config.configurable?.canvasContextSummary;
    const canvasSkillResult = config.configurable?.canvasSkillResult;

    const systemMessage = new SystemMessage(CHAT_AGENT_SYSTEM_PROMPT);
    const readOnlyBoundaryMessage = new SystemMessage(`Agent execution boundary:

You may analyze the chat and any supplied read-only canvas context or skill result.
You must not claim to execute canvas actions.
You cannot create, delete, move, edit, save, or generate canvas content.
You cannot modify nodes, workflows, tasks, provider settings, files, or external systems from this chat.
For action requests, explain that you can only analyze the canvas and provide suggested steps.`);
    const canvasContextMessage = canvasContextSummary
        ? new SystemMessage(`Read-only canvas context for this turn:

Canvas context is read-only.
You may reason about node metadata, selection, prompts, statuses, groups, and parent-child links.
You cannot inspect image pixels unless the user explicitly attached media in the chat message.
Do not claim you saw image contents from result URLs or canvas thumbnails.
Do not execute actions, create nodes, move nodes, delete nodes, run generation, save workflows, or modify workflows.
If asked to act, explain that you can only analyze the current canvas and provide suggested steps.

${canvasContextSummary}`)
        : null;
    const canvasSkillMessage = canvasSkillResult
        ? new SystemMessage(formatCanvasSkillResult(canvasSkillResult))
        : null;
    const allMessages = [
        systemMessage,
        readOnlyBoundaryMessage,
        canvasContextMessage,
        canvasSkillMessage,
        ...state.messages,
    ].filter(Boolean);

    const openAIMessages = toOpenAICompatibleMessages(allMessages);

    const responseText = await callTextModel({
        messages: openAIMessages,
        chatConfig,
        temperature: 0.7,
        maxTokens: 2048,
    });

    return {
        messages: [new AIMessage(responseText || "No response returned.")],
    };
}

// ============================================================================
// GRAPH DEFINITION
// ============================================================================

export function createChatGraph() {
    const workflow = new StateGraph(MessagesAnnotation)
        .addNode("agent", agentNode)
        .addEdge("__start__", "agent")
        .addEdge("agent", END);

    return workflow.compile();
}

// ============================================================================
// TOPIC GENERATION
// ============================================================================

export async function generateTopicTitle(messages, apiKey) {
    const chatConfig = getAgentChatConfig({
        runtimeApiKey: apiKey,
    });

    const contextMessages = messages.slice(0, 6);
    const conversationSummary = contextMessages
        .map(m => {
            const role = m._getType?.() === "human" ? "User" : "Assistant";
            const content =
                typeof m.content === "string"
                    ? m.content
                    : JSON.stringify(m.content);

            return `${role}: ${content}`;
        })
        .join("\n");

    const prompt = `${TOPIC_GENERATION_PROMPT}\n\nConversation:\n${conversationSummary}`;

    const responseText = await callTextModel({
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
        chatConfig,
        temperature: 0.3,
        maxTokens: 80,
    });

    return responseText.trim() || "New Chat";
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    createChatGraph,
    generateTopicTitle,
};
