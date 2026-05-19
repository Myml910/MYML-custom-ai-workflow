import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchRuntimeStatus, RuntimeStatus } from '../services/runtimeService';

type RuntimeListener = () => void;

let cachedRuntime: RuntimeStatus | null = null;
let cachedError: string | null = null;
let pendingRuntimeRequest: Promise<RuntimeStatus> | null = null;
let hasRequestedRuntime = false;
const listeners = new Set<RuntimeListener>();

function notifyListeners() {
    listeners.forEach(listener => listener());
}

function subscribe(listener: RuntimeListener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

async function loadRuntimeStatus({ force = false } = {}) {
    if (!force && cachedRuntime) return cachedRuntime;
    if (!force && pendingRuntimeRequest) return pendingRuntimeRequest;

    hasRequestedRuntime = true;
    pendingRuntimeRequest = fetchRuntimeStatus()
        .then(runtime => {
            cachedRuntime = runtime;
            cachedError = null;
            return runtime;
        })
        .catch(error => {
            cachedError = error?.message || 'Runtime status unavailable. Check login/session or server health.';
            throw error;
        })
        .finally(() => {
            pendingRuntimeRequest = null;
            notifyListeners();
        });

    return pendingRuntimeRequest;
}

export function useRuntimeStatus() {
    const [runtime, setRuntime] = useState<RuntimeStatus | null>(cachedRuntime);
    const [error, setError] = useState<string | null>(cachedError);
    const [loading, setLoading] = useState(!cachedRuntime && !cachedError && !hasRequestedRuntime);

    const syncState = useCallback(() => {
        setRuntime(cachedRuntime);
        setError(cachedError);
        setLoading(Boolean(pendingRuntimeRequest));
    }, []);

    useEffect(() => {
        const unsubscribe = subscribe(syncState);

        if (!cachedRuntime && !pendingRuntimeRequest && !hasRequestedRuntime) {
            setLoading(true);
            loadRuntimeStatus().catch(() => {
                // Error state is propagated through cachedError; avoid console noise.
            });
        } else {
            syncState();
        }

        return unsubscribe;
    }, [syncState]);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const nextRuntime = await loadRuntimeStatus({ force: true });
            setRuntime(nextRuntime);
            setError(null);
            return nextRuntime;
        } catch (refreshError: any) {
            const message = refreshError?.message || 'Runtime status unavailable. Check login/session or server health.';
            setError(message);
            throw refreshError;
        } finally {
            setLoading(false);
        }
    }, []);

    const canGenerate = Boolean(
        runtime?.ok === true &&
        runtime.workerEnabled === true &&
        runtime.libraryWritable !== false
    );

    const isRuntimeHealthy = useMemo(() => (
        Boolean(runtime?.ok === true && !error && canGenerate)
    ), [canGenerate, error, runtime?.ok]);

    return {
        runtime,
        loading,
        error,
        refresh,
        isRuntimeHealthy,
        canGenerate
    };
}
