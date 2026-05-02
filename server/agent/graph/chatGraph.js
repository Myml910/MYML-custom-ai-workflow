/**
 * chatGraph.js
 *
 * LangGraph state graph for the chat agent.
 * Defines the workflow: receives messages → processes with LLM → returns response.
 *
 * This version uses an OpenAI-compatible Chat Completions API.
 * Example:
 * CHAT_API_BASE_URL=https://ai.t8star.cn/v1
 * CHAT_API_KEY=your_key
 * CHAT_MODEL=gpt-5.4
 */

import { StateGraph, MessagesAnnotation, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { CHAT_AGENT_SYSTEM_PROMPT, TOPIC_GENERATION_PROMPT } from "../prompts/system.js";

// ============================================================================
// MODEL CONFIGURATION
// ============================================================================

function getChatConfig(runtimeApiKey) {
    const baseUrl = process.env.CHAT_API_BASE_URL || "https://api.openai.com/v1";

    const apiKey =
        process.env.CHAT_API_KEY ||
        runtimeApiKey ||
        process.env.OPENAI_API_KEY ||
        "";

    const model = process.env.CHAT_MODEL || "gpt-5.4";
    const reasoningEffort = process.env.CHAT_REASONING_EFFORT || "none";

    return {
        baseUrl: baseUrl.replace(/\/$/, ""),
        apiKey,
        model,
        reasoningEffort,
    };
}

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

async function callChatCompletions({
    messages,
    apiKey,
    baseUrl,
    model,
    reasoningEffort,
    temperature = 0.7,
    maxTokens = 2048,
}) {
    if (!apiKey) {
        throw new Error("CHAT_API_KEY is not configured. Add CHAT_API_KEY to your .env file.");
    }

    const url = `${baseUrl}/chat/completions`;

    const body = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
    };

    // Your third-party gateway says reasoning_effort supports:
    // none / low / medium / high.
    // If it is set to none, do not send it.
    if (reasoningEffort && reasoningEffort !== "none") {
        body.reasoning_effort = reasoningEffort;
    }

    console.log(`[ChatGraph] Calling ${url}`);
    console.log(`[ChatGraph] Model: ${model}`);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    const rawText = await response.text();

    let data;
    try {
        data = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
        throw new Error(`Chat API returned non-JSON response: ${rawText.slice(0, 500)}`);
    }

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.message ||
            response.statusText ||
            "Chat API request failed";

        throw new Error(message);
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

// ============================================================================
// GRAPH NODES
// ============================================================================

async function agentNode(state, config) {
    const chatConfig = getChatConfig(config.configurable?.apiKey);

    const systemMessage = new SystemMessage(CHAT_AGENT_SYSTEM_PROMPT);
    const allMessages = [systemMessage, ...state.messages];

    const openAIMessages = toOpenAICompatibleMessages(allMessages);

    const responseText = await callChatCompletions({
        messages: openAIMessages,
        apiKey: chatConfig.apiKey,
        baseUrl: chatConfig.baseUrl,
        model: chatConfig.model,
        reasoningEffort: chatConfig.reasoningEffort,
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
    const chatConfig = getChatConfig(apiKey);

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

    const responseText = await callChatCompletions({
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
        apiKey: chatConfig.apiKey,
        baseUrl: chatConfig.baseUrl,
        model: process.env.CHAT_TOPIC_MODEL || chatConfig.model,
        reasoningEffort: chatConfig.reasoningEffort,
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