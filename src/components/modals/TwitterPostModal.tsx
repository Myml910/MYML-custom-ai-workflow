/**
 * TwitterPostModal.tsx
 * 
 * Modal overlay for posting media to Twitter (X).
 * Shows media preview and allows users to compose tweet text before posting.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, Send, ExternalLink, LogOut } from 'lucide-react';
import { t, type Language } from '../../i18n/translations';

// ============================================================================
// TYPES
// ============================================================================

interface TwitterPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    mediaUrl: string | null;
    mediaType: 'image' | 'video';
}

interface TwitterUser {
    id: string;
    username: string;
    name: string;
}

type PostStatus = 'idle' | 'authenticating' | 'posting' | 'success' | 'error';

// Twitter (X) brand icon SVG
const XIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

// ============================================================================
// SESSION STORAGE KEY
// ============================================================================

const TWITTER_SESSION_KEY = 'twitter_session_id';

const getCurrentLanguage = (): Language => {
    if (typeof window === 'undefined') return 'zh';
    return (localStorage.getItem('myml-language') as Language) || 'zh';
};

const getInferredTheme = (): 'dark' | 'light' => {
    if (typeof document === 'undefined') return 'dark';
    return document.querySelector('.bg-neutral-50.text-neutral-900') ? 'light' : 'dark';
};

// ============================================================================
// COMPONENT
// ============================================================================

export const TwitterPostModal: React.FC<TwitterPostModalProps> = ({
    isOpen,
    onClose,
    mediaUrl,
    mediaType
}) => {
    // --- State ---
    const [tweetText, setTweetText] = useState('');
    const [status, setStatus] = useState<PostStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [tweetUrl, setTweetUrl] = useState<string | null>(null);
    const [user, setUser] = useState<TwitterUser | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Character limit
    const MAX_CHARS = 280;
    const charsRemaining = MAX_CHARS - tweetText.length;
    const isOverLimit = charsRemaining < 0;
    const language = getCurrentLanguage();
    const isDark = getInferredTheme() === 'dark';
    const overlayClass = isDark ? 'bg-neutral-950/75' : 'bg-neutral-900/35';
    const shellClass = isDark
        ? 'bg-[#151815] border-neutral-800 text-neutral-100'
        : 'bg-white border-neutral-200 text-neutral-900';
    const dividerClass = isDark ? 'border-neutral-800' : 'border-neutral-200';
    const mutedTextClass = isDark ? 'text-neutral-400' : 'text-neutral-600';
    const helperTextClass = isDark ? 'text-neutral-500' : 'text-neutral-500';
    const iconTileClass = isDark
        ? 'bg-[#1A1D1A] border-neutral-700 text-neutral-100'
        : 'bg-neutral-100 border-neutral-200 text-neutral-900';
    const mediaShellClass = isDark ? 'bg-[#101210] border-neutral-800' : 'bg-neutral-100 border-neutral-200';
    const inputClass = isDark
        ? 'bg-[#101210] border-neutral-700 text-neutral-100 placeholder-neutral-500 disabled:text-neutral-500 disabled:bg-neutral-900/70'
        : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400 disabled:text-neutral-400 disabled:bg-neutral-100';
    const secondaryButtonClass = isDark
        ? 'border-neutral-700 bg-[#1A1D1A] text-neutral-200 hover:bg-neutral-800'
        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100';
    const primaryButtonClass = isDark
        ? 'bg-[#D8FF00] text-neutral-950 hover:bg-[#c8ed00]'
        : 'bg-lime-600 text-neutral-50 hover:bg-lime-700';
    const subtleLinkClass = isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-700';

    // --- Effects ---

    // Check auth status and focus textarea when modal opens
    useEffect(() => {
        if (isOpen) {
            // Load session from localStorage
            const storedSession = localStorage.getItem(TWITTER_SESSION_KEY);
            if (storedSession) {
                setSessionId(storedSession);
                checkAuthStatus(storedSession);
            }
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setTweetText('');
            setStatus('idle');
            setError(null);
            setTweetUrl(null);
        }
    }, [isOpen]);

    // Listen for OAuth popup messages
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'twitter-auth-success') {
                const { sessionId: newSessionId, user: newUser } = event.data;
                setSessionId(newSessionId);
                setUser(newUser);
                localStorage.setItem(TWITTER_SESSION_KEY, newSessionId);
                setStatus('idle');
                setError(null);
            } else if (event.data.type === 'twitter-auth-error') {
                setError(event.data.error || t(getCurrentLanguage(), 'authenticationFailedError'));
                setStatus('error');
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // --- Helpers ---

    const checkAuthStatus = async (session: string) => {
        try {
            const response = await fetch(`/api/twitter/status?sessionId=${session}`);
            const data = await response.json();

            if (data.authenticated && data.user) {
                setUser(data.user);
            } else {
                // Session expired
                localStorage.removeItem(TWITTER_SESSION_KEY);
                setSessionId(null);
                setUser(null);
            }
        } catch (err) {
            console.error('Failed to check auth status:', err);
        }
    };

    // --- Event Handlers ---

    const handleLogin = async () => {
        setStatus('authenticating');
        setError(null);

        try {
            const response = await fetch('/api/twitter/auth');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || t(language, 'failedStartAuthenticationError'));
            }

            // Open OAuth popup
            const popup = window.open(
                data.authUrl,
                'Twitter Login',
                'width=600,height=700,left=200,top=100'
            );

            // Check if popup was blocked
            if (!popup) {
                throw new Error(t(language, 'popupBlockedError'));
            }
        } catch (err: any) {
            console.error('Twitter auth error:', err);
            setError(err.message || t(language, 'failedStartAuthenticationError'));
            setStatus('error');
        }
    };

    const handleLogout = async () => {
        if (sessionId) {
            try {
                await fetch('/api/twitter/logout', {
                    method: 'POST',
                    headers: { 'X-Twitter-Session': sessionId }
                });
            } catch (err) {
                console.error('Logout error:', err);
            }
        }

        localStorage.removeItem(TWITTER_SESSION_KEY);
        setSessionId(null);
        setUser(null);
    };

    const handlePost = async (skipMedia = false) => {
        if (!sessionId || isOverLimit) return;
        if (!skipMedia && !mediaUrl) return;
        if (!tweetText.trim()) {
            setError(t(language, 'enterPostTextError'));
            return;
        }

        setStatus('posting');
        setError(null);

        try {
            const body: any = {
                text: tweetText.trim()
            };

            // Only include media if not skipping
            if (!skipMedia && mediaUrl) {
                body.mediaUrl = mediaUrl;
                body.mediaType = mediaType;
            }

            const response = await fetch('/api/twitter/post', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Twitter-Session': sessionId
                },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || t(language, 'failedPostTweetError'));
            }

            setTweetUrl(data.tweetUrl);
            setStatus('success');
        } catch (err: any) {
            console.error('Post error:', err);
            setError(err.message || t(language, 'failedPostTweetError'));
            setStatus('error');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    // --- Render ---

    if (!isOpen) return null;

    // Build the full media URL for display
    const fullMediaUrl = mediaUrl?.startsWith('http')
        ? mediaUrl
        : mediaUrl;

    return (
        <div
            className={`fixed inset-0 ${overlayClass} backdrop-blur-sm z-50 flex items-center justify-center p-4 motion-modal-overlay-in`}
            onClick={(e) => e.target === e.currentTarget && status !== 'posting' && onClose()}
            onKeyDown={handleKeyDown}
        >
            <div className={`${shellClass} border rounded-xl w-[550px] max-w-full max-h-[90vh] shadow-xl overflow-hidden flex flex-col motion-modal-dialog-in`}>

                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b ${dividerClass}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${iconTileClass}`} aria-hidden="true">
                            <XIcon />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold">{t(language, 'postToX')}</h2>
                            {user && (
                                <p className={`text-xs ${mutedTextClass}`}>@{user.username}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={status === 'posting'}
                        aria-label={t(language, 'closeXPostModal')}
                        title={t(language, 'closeXPostModal')}
                        className={`w-9 h-9 inline-flex items-center justify-center rounded-lg ${isDark ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto">
                    {/* Not Authenticated State */}
                    {!user && status !== 'authenticating' && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className={`w-14 h-14 rounded-lg border flex items-center justify-center ${iconTileClass}`} aria-hidden="true">
                                <XIcon />
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-semibold">{t(language, 'connectXAccount')}</h3>
                                <p className={`text-sm ${mutedTextClass} mt-1`}>
                                    {t(language, 'signInPostMYMLCanvas')}
                                </p>
                            </div>
                            <button
                                onClick={handleLogin}
                                className={`h-10 inline-flex items-center gap-2 px-4 rounded-lg text-sm font-semibold ${primaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                            >
                                <XIcon />
                                {t(language, 'signInWithX')}
                            </button>
                            {error && (
                                <p className="text-sm text-red-500 mt-2">{error}</p>
                            )}
                        </div>
                    )}

                    {/* Authenticating State */}
                    {status === 'authenticating' && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <Loader2 size={40} className="text-[#D8FF00] animate-spin" />
                            <p className={mutedTextClass}>{t(language, 'waitingAuthorization')}</p>
                            <p className={`text-xs ${helperTextClass}`}>{t(language, 'completeSignInPopup')}</p>
                        </div>
                    )}

                    {/* Authenticated - Compose Tweet */}
                    {user && status !== 'success' && (
                        <div className="space-y-4">
                            {/* Media Preview */}
                            <div className={`rounded-lg overflow-hidden border ${mediaShellClass}`}>
                                {mediaType === 'video' ? (
                                    <video
                                        src={fullMediaUrl}
                                        className="w-full max-h-[250px] object-contain"
                                        controls
                                        muted
                                        title={t(language, 'mediaToPostVideoTitle')}
                                    />
                                ) : (
                                    <img
                                        src={fullMediaUrl}
                                        alt={t(language, 'mediaToPostAlt')}
                                        className="w-full max-h-[250px] object-contain"
                                    />
                                )}
                            </div>

                            {/* Tweet Text Input */}
                            <div className="space-y-2">
                                <textarea
                                    ref={textareaRef}
                                    value={tweetText}
                                    onChange={(e) => setTweetText(e.target.value)}
                                    placeholder={t(language, 'twitterPostPlaceholder')}
                                    aria-label={t(language, 'twitterPostPlaceholder')}
                                    disabled={status === 'posting'}
                                    className={`w-full border rounded-lg p-4 text-sm ${inputClass} focus:outline-none focus:border-[#D8FF00] focus:ring-2 focus:ring-[#D8FF00]/25 transition-colors duration-150 resize-none disabled:opacity-70 disabled:cursor-not-allowed`}
                                    rows={3}
                                />
                                <div className="flex justify-between items-center text-sm">
                                    <span className={helperTextClass}>
                                        {t(language, 'optionalCaptionForPost')}
                                    </span>
                                    <span className={`${isOverLimit ? 'text-red-500' : charsRemaining <= 20 ? 'text-amber-500' : helperTextClass}`}>
                                        {charsRemaining}
                                    </span>
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && status === 'error' && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3" role="alert">
                                    <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm text-red-500">{error}</p>
                                        <button
                                            onClick={() => {
                                                setStatus('idle');
                                                setError(null);
                                            }}
                                            className="text-xs text-red-500/80 hover:text-red-600 mt-1 underline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 rounded"
                                        >
                                            {t(language, 'tryAgain')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Logout option */}
                            <button
                                onClick={handleLogout}
                                className={`flex items-center gap-1.5 text-xs ${subtleLinkClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/30 rounded`}
                            >
                                <LogOut size={12} />
                                {t(language, 'signOutOfX')} @{user.username}
                            </button>
                        </div>
                    )}

                    {/* Success State */}
                    {status === 'success' && tweetUrl && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className="w-14 h-14 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                                <CheckCircle size={34} className="text-emerald-500" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-semibold">{t(language, 'postedSuccessfully')}</h3>
                                <p className={`text-sm ${mutedTextClass} mt-1`}>
                                    {t(language, 'xPostLive')}
                                </p>
                            </div>
                            <a
                                href={tweetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`h-10 inline-flex items-center gap-2 px-4 rounded-lg text-sm font-semibold ${primaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                            >
                                <ExternalLink size={18} />
                                {t(language, 'viewOnX')}
                            </a>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`p-4 border-t ${dividerClass} flex justify-end gap-2`}>
                    <button
                        onClick={onClose}
                        disabled={status === 'posting'}
                        className={`h-9 px-4 rounded-lg border text-sm font-semibold ${secondaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                        {status === 'success' ? t(language, 'close') : t(language, 'cancel')}
                    </button>

                    {user && status !== 'success' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => handlePost(true)}
                                disabled={status === 'posting' || isOverLimit || !tweetText.trim()}
                                className={`h-9 inline-flex items-center gap-2 px-4 rounded-lg border text-sm font-semibold ${secondaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 disabled:opacity-60 disabled:cursor-not-allowed`}
                                title={t(language, 'postTextOnlyTitle')}
                                aria-label={t(language, 'postTextOnlyTitle')}
                            >
                                {t(language, 'textOnly')}
                            </button>
                            <button
                                onClick={() => handlePost(false)}
                                disabled={status === 'posting' || isOverLimit || !mediaUrl || !tweetText.trim()}
                                className={`h-9 inline-flex items-center gap-2 px-5 rounded-lg text-sm font-semibold ${primaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                                {status === 'posting' ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        {t(language, 'posting')}
                                    </>
                                ) : (
                                    <>
                                        <Send size={18} />
                                        {t(language, 'post')}
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
