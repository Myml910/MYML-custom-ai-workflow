/**
 * matting.js
 *
 * Proxy routes for the local MYML Matting Engine.
 */

import express from 'express';

const router = express.Router();
const DEFAULT_MATTING_BASE_URL = 'http://127.0.0.1:8000';

function getMattingBaseUrl() {
    console.log("requests from " + (process.env.MYML_MATTING_BASE_URL || DEFAULT_MATTING_BASE_URL).replace(/\/$/, ''))
    return (process.env.MYML_MATTING_BASE_URL || DEFAULT_MATTING_BASE_URL).replace(/\/$/, '');
}

router.post('/remove-bg', async (req, res) => {
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Expected multipart/form-data request.' });
    }

    const endpoint = `${getMattingBaseUrl()}/api/matting/remove-bg`;

    try {
        const upstreamResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-type': contentType,
                ...(req.headers['content-length'] ? { 'content-length': req.headers['content-length'] } : {})
            },
            body: req,
            duplex: 'half'
        });

        const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
        const upstreamContentType = upstreamResponse.headers.get('content-type');

        if (upstreamContentType) {
            res.setHeader('Content-Type', upstreamContentType);
        }

        return res.status(upstreamResponse.status).send(responseBuffer);
    } catch (error) {
        console.error('[Matting Proxy] remove-bg failed:', error);
        return res.status(502).json({
            error: 'Matting Engine proxy request failed.',
            details: error.message
        });
    }
});

export default router;
