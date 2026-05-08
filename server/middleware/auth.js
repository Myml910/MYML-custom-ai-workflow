import crypto from 'crypto';
import { findUserById, getPublicUserFromRow } from '../db/users.js';

export const AUTH_COOKIE_NAME = 'myml_auth';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function base64UrlEncode(value) {
    return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function getAuthSecret() {
    return process.env.MYML_AUTH_SECRET;
}

function signPayload(encodedPayload, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(encodedPayload)
        .digest('base64url');
}

function safeEqual(a, b) {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);

    if (aBuffer.length !== bBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function parseCookies(cookieHeader = '') {
    return cookieHeader.split(';').reduce((cookies, part) => {
        const [rawName, ...rawValue] = part.trim().split('=');
        if (!rawName || rawValue.length === 0) return cookies;
        cookies[rawName] = decodeURIComponent(rawValue.join('='));
        return cookies;
    }, {});
}

export function createAuthToken(user) {
    const secret = getAuthSecret();
    if (!secret) {
        throw new Error('MYML_AUTH_SECRET is not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        id: user.id,
        username: user.username,
        role: user.role || 'admin',
        iat: now,
        exp: now + TOKEN_TTL_SECONDS
    };

    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = signPayload(encodedPayload, secret);
    return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token) {
    const secret = getAuthSecret();
    if (!secret || !token || typeof token !== 'string') {
        return null;
    }

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
        return null;
    }

    const expectedSignature = signPayload(encodedPayload, secret);
    if (!safeEqual(signature, expectedSignature)) {
        return null;
    }

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        const now = Math.floor(Date.now() / 1000);

        if (!payload.id || !payload.username || !payload.exp || payload.exp < now) {
            return null;
        }

        return {
            id: payload.id,
            username: payload.username,
            role: payload.role || 'admin'
        };
    } catch {
        return null;
    }
}

export function getAuthUser(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    return verifyAuthToken(cookies[AUTH_COOKIE_NAME]);
}

export function getAuthCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.MYML_COOKIE_SECURE === 'true',
        sameSite: 'lax',
        path: '/',
        maxAge: TOKEN_TTL_SECONDS * 1000
    };
}

export function requireAuth(req, res, next) {
    const tokenUser = getAuthUser(req);

    if (!tokenUser?.id) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const userRow = findUserById(tokenUser.id);
    if (!userRow) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (userRow.status !== 'active') {
        return res.status(403).json({ error: 'User is disabled' });
    }

    const user = getPublicUserFromRow(userRow);
    req.user = user;
    return next();
}

export function requireRole(...roles) {
    return (req, res, next) => {
        const user = req.user;

        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        req.user = user;
        return next();
    };
}
