export interface RuntimeProviderGates {
    atlas?: boolean;
    atlasNanoBanana2?: boolean;
    requireTeamProviderCredentials?: boolean;
    [key: string]: boolean | undefined;
}

export interface RuntimeStatus {
    ok: boolean;
    cwd?: string;
    nodeEnv?: string;
    gitCommit?: string;
    entrypoint?: string;
    workerEnabled: boolean;
    libraryDir?: string;
    libraryWritable?: boolean;
    providerGates?: RuntimeProviderGates;
    imageModelCount?: number | 'unknown';
    imageModelIds?: string[];
}

async function readRuntimeJson(response: Response): Promise<any> {
    return response.json().catch(() => ({}));
}

export async function fetchRuntimeStatus(): Promise<RuntimeStatus> {
    const response = await fetch('/api/runtime', {
        credentials: 'include'
    });

    const data = await readRuntimeJson(response);
    if (!response.ok) {
        const statusMessage = response.status === 401
            ? 'Runtime status unavailable: login session may be expired.'
            : (data?.error || `${response.status} ${response.statusText}`);
        throw new Error(statusMessage);
    }

    if (!data || typeof data !== 'object') {
        throw new Error('Invalid /api/runtime response.');
    }

    return {
        ok: data.ok === true,
        cwd: typeof data.cwd === 'string' ? data.cwd : undefined,
        nodeEnv: typeof data.nodeEnv === 'string' ? data.nodeEnv : undefined,
        gitCommit: typeof data.gitCommit === 'string' ? data.gitCommit : undefined,
        entrypoint: typeof data.entrypoint === 'string' ? data.entrypoint : undefined,
        workerEnabled: data.workerEnabled === true,
        libraryDir: typeof data.libraryDir === 'string' ? data.libraryDir : undefined,
        libraryWritable: typeof data.libraryWritable === 'boolean' ? data.libraryWritable : undefined,
        providerGates: data.providerGates && typeof data.providerGates === 'object'
            ? data.providerGates
            : undefined,
        imageModelCount: typeof data.imageModelCount === 'number' || data.imageModelCount === 'unknown'
            ? data.imageModelCount
            : undefined,
        imageModelIds: Array.isArray(data.imageModelIds)
            ? data.imageModelIds.filter((id: unknown): id is string => typeof id === 'string')
            : []
    };
}
