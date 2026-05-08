import React, { useState } from 'react';
import { Lock, Loader2, User } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

type LoginLang = 'zh' | 'en';

const LOGIN_LANG_STORAGE_KEY = 'myml_login_lang';

const LOGIN_COPY = {
    zh: {
        brand: 'MYML Canvas',
        access: '内部访问',
        signIn: '登录',
        helper: '请使用服务器中配置的内部测试账号。',
        username: '用户名',
        password: '密码',
        passwordPlaceholder: '请输入密码',
        enterCanvas: '进入画布',
        signingIn: '登录中...',
        invalidCredentials: '账号或密码错误',
        signInFailed: '登录失败，请稍后重试',
        zh: '中文',
        en: 'EN'
    },
    en: {
        brand: 'MYML Canvas',
        access: 'Internal Access',
        signIn: 'Sign in',
        helper: 'Use the internal test account configured on the server.',
        username: 'Username',
        password: 'Password',
        passwordPlaceholder: 'Password',
        enterCanvas: 'Enter Canvas',
        signingIn: 'Signing in...',
        invalidCredentials: 'Invalid username or password',
        signInFailed: 'Sign in failed. Please try again.',
        zh: '中文',
        en: 'EN'
    }
} satisfies Record<LoginLang, Record<string, string>>;

function getInitialLoginLang(): LoginLang {
    if (typeof window === 'undefined') return 'zh';
    return window.localStorage.getItem(LOGIN_LANG_STORAGE_KEY) === 'en' ? 'en' : 'zh';
}

export const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const [lang, setLang] = useState<LoginLang>(getInitialLoginLang);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const copy = LOGIN_COPY[lang];

    const handleLangChange = (nextLang: LoginLang) => {
        setLang(nextLang);
        window.localStorage.setItem(LOGIN_LANG_STORAGE_KEY, nextLang);
        setError(null);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            await login(username.trim(), password);
            window.history.replaceState(null, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (err) {
            const message = err instanceof Error ? err.message : '';
            setError(message.toLowerCase().includes('invalid')
                ? copy.invalidCredentials
                : copy.signInFailed);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center overflow-hidden relative">
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(rgba(216,255,0,0.34)_1px,transparent_1px)] [background-size:24px_24px]" />
            <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#D8FF00]/10 to-transparent" />

            <div className="absolute right-6 top-6 z-20 flex items-center gap-2 rounded-full border border-[#D8FF00]/20 bg-black/70 p-1">
                {(['zh', 'en'] as const).map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => handleLangChange(option)}
                        aria-label={option === 'zh' ? '切换到中文' : 'Switch to English'}
                        aria-pressed={lang === option}
                        className={`h-8 px-3 rounded-full text-xs font-black uppercase tracking-[0.1em] transition-colors ${
                            lang === option
                                ? 'bg-[#D8FF00] text-black'
                                : 'text-neutral-400 hover:text-[#D8FF00]'
                        }`}
                    >
                        {LOGIN_COPY[option][option]}
                    </button>
                ))}
            </div>

            <main className="relative z-10 w-full max-w-sm px-6">
                <div className="mb-8 flex items-center gap-3">
                    <img
                        src="/TwitCanva-logo.png"
                        alt="MYML Canvas Logo"
                        className="w-10 h-10 object-contain"
                    />
                    <div>
                        <h1 className="text-lg font-black tracking-[0.16em] uppercase text-[#D8FF00]">
                            {copy.brand}
                        </h1>
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                            {copy.access}
                        </p>
                    </div>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="rounded-lg border border-[#D8FF00]/20 bg-black/80 shadow-[0_0_36px_rgba(216,255,0,0.08)] p-6"
                >
                    <div className="mb-6">
                        <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white">
                            {copy.signIn}
                        </h2>
                        <p className="mt-2 text-sm text-neutral-500">
                            {copy.helper}
                        </p>
                    </div>

                    <label className="block mb-4">
                        <span className="block text-xs font-black uppercase tracking-[0.14em] text-neutral-400 mb-2">
                            {copy.username}
                        </span>
                        <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 focus-within:border-[#D8FF00]/60">
                            <User size={16} className="text-neutral-500" />
                            <input
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                autoComplete="username"
                                className="h-11 flex-1 bg-transparent outline-none text-sm text-white placeholder:text-neutral-700"
                                placeholder="admin"
                            />
                        </div>
                    </label>

                    <label className="block mb-4">
                        <span className="block text-xs font-black uppercase tracking-[0.14em] text-neutral-400 mb-2">
                            {copy.password}
                        </span>
                        <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 focus-within:border-[#D8FF00]/60">
                            <Lock size={16} className="text-neutral-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                                className="h-11 flex-1 bg-transparent outline-none text-sm text-white placeholder:text-neutral-700"
                                placeholder={copy.passwordPlaceholder}
                            />
                        </div>
                    </label>

                    {error && (
                        <div className="mb-4 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting || !username.trim() || !password}
                        className="w-full h-11 rounded-full bg-[#D8FF00] text-black font-black uppercase tracking-[0.12em] text-sm flex items-center justify-center gap-2 hover:bg-[#e4ff3a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                        {isSubmitting ? copy.signingIn : copy.enterCanvas}
                    </button>
                </form>
            </main>
        </div>
    );
};
