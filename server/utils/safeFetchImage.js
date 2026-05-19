import dns from 'dns/promises';
import net from 'net';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const ALLOWED_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif'
]);

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isUnsafeHostname(hostname) {
    const value = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    return value === 'localhost' || value.endsWith('.localhost');
}

function isUnsafeIPv4(address) {
    const parts = String(address || '').split('.').map(part => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }

    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

function isUnsafeIPv6(address) {
    const value = String(address || '').toLowerCase();
    if (!value || value === '::' || value === '::1') return true;

    const mappedIpv4 = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) return isUnsafeIPv4(mappedIpv4[1]);

    const firstBlock = Number.parseInt(value.split(':')[0] || '0', 16);
    if (!Number.isFinite(firstBlock)) return true;

    const isLinkLocal = (firstBlock & 0xffc0) === 0xfe80;
    const isUniqueLocal = (firstBlock & 0xfe00) === 0xfc00;
    return isLinkLocal || isUniqueLocal;
}

function isUnsafeAddress(address) {
    const ipType = net.isIP(address);
    if (ipType === 4) return isUnsafeIPv4(address);
    if (ipType === 6) return isUnsafeIPv6(address);
    return true;
}

async function assertSafeImageUrl(inputUrl) {
    let parsed;
    try {
        parsed = new URL(inputUrl);
    } catch {
        throw new Error('Blocked unsafe image URL: invalid URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Blocked unsafe image URL: only http(s) URLs are allowed');
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

    if (isUnsafeHostname(hostname)) {
        throw new Error('Blocked unsafe image URL: localhost is not allowed');
    }

    const directIpType = net.isIP(hostname);
    if (directIpType && isUnsafeAddress(hostname)) {
        throw new Error('Blocked unsafe image URL: private or local IP is not allowed');
    }

    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true });
    } catch (error) {
        throw new Error(`Blocked unsafe image URL: DNS lookup failed (${error.message})`);
    }

    if (!addresses.length || addresses.some(record => isUnsafeAddress(record.address))) {
        throw new Error('Blocked unsafe image URL: resolved to private or local IP');
    }

    return parsed;
}

function getNormalizedContentType(response) {
    return (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
}

async function readLimitedBody(response, maxBytes) {
    if (!response.body?.getReader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) {
            throw new Error('Image response too large');
        }
        return buffer;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maxBytes) {
            reader.cancel?.();
            throw new Error('Image response too large');
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks, total);
}

export async function safeFetchImageUrl(url, options = {}) {
    const timeoutMs = parsePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    const maxBytes = parsePositiveInteger(options.maxBytes, DEFAULT_MAX_BYTES);
    const maxRedirects = parsePositiveInteger(options.maxRedirects, DEFAULT_MAX_REDIRECTS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    let currentUrl = String(url || '').trim();

    try {
        for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
            const parsedUrl = await assertSafeImageUrl(currentUrl);
            const response = await fetch(parsedUrl.toString(), {
                method: 'GET',
                headers: {
                    Accept: 'image/*',
                    ...(options.headers || {})
                },
                redirect: 'manual',
                signal: controller.signal
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) {
                    throw new Error('Image fetch redirect missing Location header');
                }
                currentUrl = new URL(location, parsedUrl).toString();
                continue;
            }

            if (!response.ok) {
                throw new Error(`Image fetch failed: ${response.status} ${response.statusText}`);
            }

            const contentType = getNormalizedContentType(response);
            if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
                throw new Error('Unsupported image content type');
            }

            const declaredLength = Number.parseInt(response.headers.get('content-length') || '', 10);
            if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
                throw new Error('Image response too large');
            }

            const buffer = await readLimitedBody(response, maxBytes);
            return {
                buffer,
                contentType,
                contentLength: buffer.length,
                url: response.url || currentUrl
            };
        }

        throw new Error('Image fetch exceeded redirect limit');
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('Image fetch timeout');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
