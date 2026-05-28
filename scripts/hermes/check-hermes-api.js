import dotenv from 'dotenv';

dotenv.config();

const HEALTH_TIMEOUT_MS = 10000;

function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function buildHealthUrl(baseUrl) {
    const parsed = new URL(baseUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.at(-1)?.toLowerCase() === 'v1') {
        parts.pop();
    }
    parts.push('health');
    parsed.pathname = `/${parts.join('/')}`;
    parsed.search = '';
    parsed.hash = '';
    return parsed;
}

function printTroubleshooting() {
    console.log('');
    console.log('[HermesApi] Troubleshooting checklist:');
    console.log('1. Is Hermes gateway running?');
    console.log('2. Is API_SERVER_ENABLED=true?');
    console.log('3. Are API_SERVER_HOST and API_SERVER_PORT correct?');
    console.log('4. Does API_SERVER_KEY match MYML Canvas HERMES_API_KEY?');
    console.log('5. Is a firewall or reverse proxy blocking the health endpoint?');
}

async function main() {
    const baseUrl = cleanString(process.env.HERMES_BASE_URL);
    const apiKey = cleanString(process.env.HERMES_API_KEY);

    if (!baseUrl) {
        console.log('[HermesApi] HERMES_BASE_URL is missing.');
        printTroubleshooting();
        process.exitCode = 1;
        return;
    }

    if (!apiKey) {
        console.log('[HermesApi] HERMES_API_KEY is missing. The key was not printed.');
        printTroubleshooting();
        process.exitCode = 1;
        return;
    }

    let healthUrl;
    try {
        healthUrl = buildHealthUrl(baseUrl);
    } catch {
        console.log('[HermesApi] HERMES_BASE_URL is not a valid URL. The value was not printed.');
        printTroubleshooting();
        process.exitCode = 1;
        return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
        const response = await fetch(healthUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json',
            },
            signal: controller.signal,
        });

        const bodyText = await response.text();
        let body = {};
        try {
            body = bodyText ? JSON.parse(bodyText) : {};
        } catch {
            body = {};
        }

        if (!response.ok) {
            console.log(`[HermesApi] Health check failed with HTTP ${response.status}.`);
            printTroubleshooting();
            process.exitCode = 1;
            return;
        }

        console.log('[HermesApi] Health check passed.');
        console.log(`status: ${typeof body.status === 'string' ? body.status : 'unknown'}`);
        console.log(`platform: ${typeof body.platform === 'string' ? body.platform : 'unknown'}`);
    } catch (error) {
        const timedOut = error?.name === 'AbortError';
        console.log(timedOut
            ? `[HermesApi] Health check timed out after ${HEALTH_TIMEOUT_MS}ms.`
            : `[HermesApi] Health check failed: ${error?.message || 'unknown error'}`);
        printTroubleshooting();
        process.exitCode = 1;
    } finally {
        clearTimeout(timeout);
    }
}

await main();

