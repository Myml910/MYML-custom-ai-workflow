import { Router } from 'express';
import {
    AUTH_COOKIE_NAME,
    createAuthToken,
    getAuthCookieOptions,
    getAuthUser
} from '../middleware/auth.js';
import {
    findUserById,
    findUserByUsername,
    getPublicUserFromRow,
    verifyUserPassword
} from '../db/users.js';

const router = Router();

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (!process.env.MYML_AUTH_SECRET) {
            return res.status(500).json({
                error: 'Auth is not configured. Set MYML_AUTH_SECRET.'
            });
        }

        const userRow = username ? findUserByUsername(username) : null;
        const passwordMatches = userRow
            ? await verifyUserPassword(userRow, password)
            : false;

        if (!userRow || !passwordMatches || userRow.status !== 'active') {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = getPublicUserFromRow(userRow);
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
    const tokenUser = getAuthUser(req);

    if (!tokenUser?.id) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const userRow = findUserById(tokenUser.id);
    if (!userRow || userRow.status !== 'active') {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = getPublicUserFromRow(userRow);
    return res.json({ user });
});

export default router;
