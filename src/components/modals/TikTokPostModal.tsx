/**
 * TikTokPostModal.tsx
 * 
 * Modal overlay for posting videos to TikTok.
 * Shows video preview and allows users to compose caption before posting.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, Send, LogOut } from 'lucide-react';
import { t, type Language, type TranslationKey } from '../../i18n/translations';

// ============================================================================
// TYPES
// ============================================================================

interface TikTokPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    mediaUrl: string | null;
}

interface TikTokUser {
    openId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
}

type PostStatus = 'idle' | 'authenticating' | 'posting' | 'success' | 'error';

type PrivacyLevel = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';

// TikTok brand icon SVG
const TikTokIcon = ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
);

// ============================================================================
// SESSION STORAGE KEY
// ============================================================================

const TIKTOK_SESSION_KEY = 'tiktok_session_id';

// Privacy level options
const PRIVACY_OPTIONS: { value: PrivacyLevel; labelKey: TranslationKey; descriptionKey: TranslationKey }[] = [
    { value: 'PUBLIC_TO_EVERYONE', labelKey: 'tiktokPrivacyPublic', descriptionKey: 'tiktokPrivacyPublicDesc' },
    { value: 'MUTUAL_FOLLOW_FRIENDS', labelKey: 'tiktokPrivacyFriends', descriptionKey: 'tiktokPrivacyFriendsDesc' },
    { value: 'FOLLOWER_OF_CREATOR', labelKey: 'tiktokPrivacyFollowers', descriptionKey: 'tiktokPrivacyFollowersDesc' },
    { value: 'SELF_ONLY', labelKey: 'tiktokPrivacyOnlyMe', descriptionKey: 'tiktokPrivacyOnlyMeDesc' }
];

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

export const TikTokPostModal: React.FC<TikTokPostModalProps> = ({
    isOpen,
    onClose,
    mediaUrl
}) => {
    // --- State ---
    const [captionText, setCaptionText] = useState('');
    const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>('SELF_ONLY');
    const [status, setStatus] = useState<PostStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [user, setUser] = useState<TikTokUser | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Character limit for TikTok captions
    const MAX_CHARS = 2200;
    const charsRemaining = MAX_CHARS - captionText.length;
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

    // --- Effects ---

    // Check auth status when modal opens
    useEffect(() => {
        if (isOpen) {
            // Load session from localStorage
            const storedSession = localStorage.getItem(TIKTOK_SESSION_KEY);
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
            setCaptionText('');
            setPrivacyLevel('SELF_ONLY');
            setStatus('idle');
            setError(null);
            setSuccessMessage(null);
        }
    }, [isOpen]);

    // Listen for OAuth popup messages
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'tiktok-auth-success') {
                const { sessionId: newSessionId, user: newUser } = event.data;
                setSessionId(newSessionId);
                setUser(newUser);
                localStorage.setItem(TIKTOK_SESSION_KEY, newSessionId);
                setStatus('idle');
                setError(null);
            } else if (event.data.type === 'tiktok-auth-error') {
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
            const response = await fetch(`/api/tiktok-post/status?sessionId=${session}`);
            const data = await response.json();

            if (data.authenticated && data.user) {
                setUser(data.user);
            } else {
                // Session expired
                localStorage.removeItem(TIKTOK_SESSION_KEY);
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
            const response = await fetch('/api/tiktok-post/auth');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || t(language, 'failedStartAuthenticationError'));
            }

            // Open OAuth popup
            const popup = window.open(
                data.authUrl,
                'TikTok Login',
                'width=600,height=700,left=200,top=100'
            );

            // Check if popup was blocked
            if (!popup) {
                throw new Error(t(language, 'popupBlockedError'));
            }
        } catch (err: any) {
            console.error('TikTok auth error:', err);
            setError(err.message || t(language, 'failedStartAuthenticationError'));
            setStatus('error');
        }
    };

    const handleLogout = async () => {
        if (sessionId) {
            try {
                await fetch('/api/tiktok-post/logout', {
                    method: 'POST',
                    headers: { 'X-TikTok-Session': sessionId }
                });
            } catch (err) {
                console.error('Logout error:', err);
            }
        }

        localStorage.removeItem(TIKTOK_SESSION_KEY);
        setSessionId(null);
        setUser(null);
    };

    const handlePost = async () => {
        if (!sessionId || isOverLimit || !mediaUrl) return;

        setStatus('posting');
        setError(null);

        try {
            const response = await fetch('/api/tiktok-post/post', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-TikTok-Session': sessionId
                },
                body: JSON.stringify({
                    mediaUrl: mediaUrl,
                    title: captionText.trim(),
                    privacyLevel: privacyLevel
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || t(language, 'failedPostTikTokError'));
            }

            setSuccessMessage(data.message || t(language, 'videoPostedSuccessfully'));
            setStatus('success');
        } catch (err: any) {
            console.error('Post error:', err);
            setError(err.message || t(language, 'failedPostTikTokError'));
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
                            <TikTokIcon />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold">{t(language, 'postToTikTok')}</h2>
                            {user && (
                                <p className={`text-xs ${mutedTextClass}`}>{user.displayName || user.username}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={status === 'posting'}
                        aria-label={t(language, 'closeTikTokPostModal')}
                        title={t(language, 'closeTikTokPostModal')}
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
                                <TikTokIcon size={32} />
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-semibold">{t(language, 'connectTikTokAccount')}</h3>
                                <p className={`text-sm ${mutedTextClass} mt-1`}>
                                    {t(language, 'signInPostVideosMYMLCanvas')}
                                </p>
                            </div>
                            <button
                                onClick={handleLogin}
                                className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${primaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40`}
                            >
                                <TikTokIcon />
                                {t(language, 'signInWithTikTok')}
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

                    {/* Authenticated - Compose Post */}
                    {user && status !== 'success' && (
                        <div className="space-y-4">
                            {/* Video Preview */}
                            <div className={`rounded-lg overflow-hidden border ${mediaShellClass}`}>
                                <video
                                    src={fullMediaUrl}
                                    className="w-full max-h-[200px] object-contain"
                                    controls
                                    muted
                                    title={t(language, 'tiktokVideoPreviewTitle')}
                                />
                            </div>

                            {/* Caption Input */}
                            <div className="space-y-2">
                                <label className={`text-sm ${mutedTextClass}`}>{t(language, 'tiktokCaption')}</label>
                                <textarea
                                    ref={textareaRef}
                                    value={captionText}
                                    onChange={(e) => setCaptionText(e.target.value)}
                                    placeholder={t(language, 'tiktokCaptionPlaceholder')}
                                    aria-label={t(language, 'tiktokCaption')}
                                    disabled={status === 'posting'}
                                    className={`w-full border rounded-lg p-4 text-sm ${inputClass} focus:outline-none focus:border-[#D8FF00] focus:ring-2 focus:ring-[#D8FF00]/25 transition-colors duration-150 resize-none disabled:opacity-70 disabled:cursor-not-allowed`}
                                    rows={3}
                                />
                                <div className="flex justify-end">
                                    <span className={`text-sm ${isOverLimit ? 'text-red-500' : charsRemaining <= 100 ? 'text-amber-500' : helperTextClass}`}>
                                        {charsRemaining}
                                    </span>
                                </div>
                            </div>

                            {/* Privacy Level Select */}
                            <div className="space-y-2">
                                <label className={`text-sm ${mutedTextClass}`}>{t(language, 'tiktokPrivacyLabel')}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PRIVACY_OPTIONS.map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => setPrivacyLevel(option.value)}
                                            disabled={status === 'posting'}
                                            aria-pressed={privacyLevel === option.value}
                                            className={`min-h-[74px] rounded-lg border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/35 disabled:cursor-not-allowed disabled:opacity-60 ${privacyLevel === option.value
                                                    ? 'border-[#D8FF00] bg-[#D8FF00]/10'
                                                    : isDark ? 'border-neutral-700 hover:border-neutral-600' : 'border-neutral-200 hover:border-neutral-300'
                                                }`}
                                        >
                                            <span className={`block truncate text-sm font-medium ${privacyLevel === option.value ? (isDark ? 'text-[#D8FF00]' : 'text-lime-700') : ''}`}>
                                                {t(language, option.labelKey)}
                                            </span>
                                            <p className={`text-xs ${helperTextClass} mt-0.5`}>{t(language, option.descriptionKey)}</p>
                                        </button>
                                    ))}
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

                            {/* Sandbox Warning */}
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                <p className="text-xs text-amber-500">
                                    {t(language, 'tiktokSandboxWarning')}
                                </p>
                            </div>

                            {/* Logout option */}
                            <button
                                onClick={handleLogout}
                                className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-700'} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/30 rounded`}
                            >
                                <LogOut size={12} />
                                {t(language, 'signOutOfX')} {user.displayName || 'TikTok'}
                            </button>
                        </div>
                    )}

                    {/* Success State */}
                    {status === 'success' && (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className="w-14 h-14 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                                <CheckCircle size={34} className="text-emerald-500" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-semibold">{t(language, 'postedToTikTok')}</h3>
                                <p className={`text-sm ${mutedTextClass} mt-1`}>
                                    {successMessage || t(language, 'tiktokProcessing')}
                                </p>
                            </div>
                            <p className={`text-xs ${helperTextClass} text-center max-w-xs`}>
                                {t(language, 'tiktokProcessingHint')}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`flex flex-nowrap justify-end gap-2 border-t p-4 ${dividerClass}`}>
                    <button
                        onClick={onClose}
                        disabled={status === 'posting'}
                        className={`h-9 shrink-0 whitespace-nowrap rounded-lg border px-4 text-sm font-semibold ${secondaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                        {status === 'success' ? t(language, 'close') : t(language, 'cancel')}
                    </button>

                    {user && status !== 'success' && (
                        <button
                            onClick={handlePost}
                            disabled={status === 'posting' || isOverLimit || !mediaUrl}
                            className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-5 text-sm font-semibold ${primaryButtonClass} transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8FF00]/40 disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                            {status === 'posting' ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    {t(language, 'posting')}
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    {t(language, 'postToTikTokAction')}
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
