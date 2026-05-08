import { Router } from 'express';
import {
    AUTH_COOKIE_NAME,
    createAuthToken,
    getAuthCookieOptions,
    getAuthUser
} from '../middleware/auth.js';

const router = Router();

function getConfiguredCredentials() {
    return {
        username: process.env.MYML_ADMIN_USERNAME,
        password: process.env.MYML_ADMIN_PASSWORD
    };
}

function getPublicUser(username) {
    return {
        username,
        role: 'admin'
    };
}

router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body || {};
        const configured = getConfiguredCredentials();

        if (!process.env.MYML_AUTH_SECRET || !configured.username || !configured.password) {
            return res.status(500).json({
                error: 'Auth is not configured. Set MYML_AUTH_SECRET, MYML_ADMIN_USERNAME, and MYML_ADMIN_PASSWORD.'
            });
        }

        if (username !== configured.username || password !== configured.password) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = getPublicUser(configured.username);
        const token = createAuthToken(user);

        res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
        return res.json({ user });
    } catch (error) {
        console.error('[Auth] Login failed:', error);
        return res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
        ...getAuthCookieOptions(),
        maxAge: undefined
    });
    return res.json({ success: true });
});

router.get('/me', (req, res) => {
    const user = getAuthUser(req);

    if (!user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    return res.json({ user });
});

export default router;
