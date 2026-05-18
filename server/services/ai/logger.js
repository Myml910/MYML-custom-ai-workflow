const MAX_ERROR_MESSAGE_LENGTH = 800;

function compact(value) {
    return Object.fromEntries(
        Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')
    );
}

function truncate(value, maxLength) {
    if (typeof value !== 'string') return value;
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function logAiEvent(event = {}) {
    const payload = compact({
        event: event.event || 'ai_event',
        timestamp: new Date().toISOString(),
        requestId: event.requestId,
        nodeId: event.nodeId,
        provider: event.provider,
        projectModelId: event.projectModelId,
        upstreamModel: event.upstreamModel,
        taskId: event.taskId,
        status: event.status,
        durationMs: event.durationMs,
        errorType: event.errorType,
        errorMessage: truncate(event.errorMessage, MAX_ERROR_MESSAGE_LENGTH)
    });

    console.log('[AI Gateway]', payload);
}
