import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { LANG_OPTIONS } from '../../i18n';
import i18n from '../../i18n';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        username,
        password,
        totp: needs2fa ? totp : undefined,
      });
      if (data.data.requires2FA) {
        setNeeds2fa(true);
        setLoading(false);
        return;
      }
      const u = data.data.user;
      setAuth(u, data.data.accessToken, data.data.refreshToken);
      if (u.language) {
        void i18n.changeLanguage(u.language);
        localStorage.setItem('iceflow_lang', u.language);
      }
      navigate(u.role === 'MAIN_ADMIN' ? '/main' : '/sub');
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setError(e2.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-sky-200/80 via-ice-100 to-amber-100/50" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%230ea5e9\' fill-opacity=\'0.08\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-4 py-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex-1 text-ice-950">
          <p className="font-display text-5xl font-semibold tracking-tight md:text-6xl">IceFlow</p>
          <p className="mt-1 text-lg text-ice-700">Branch Manager</p>
          <p className="mt-6 max-w-md text-ice-700">{t('auth.welcome')}</p>
          <p className="mt-4 text-sm text-ice-500">
            AI assistant <span className="font-semibold text-ice-800">Ashok</span> · Offline-ready · Multi-branch
          </p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="card-panel w-full max-w-md p-6 md:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-semibold">{t('auth.login')}</h1>
            <select
              className="input !w-auto !py-1.5 !text-xs"
              value={i18n.language}
              onChange={(e) => {
                void i18n.changeLanguage(e.target.value);
                localStorage.setItem('iceflow_lang', e.target.value);
              }}
            >
              {LANG_OPTIONS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Username or email</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              placeholder="mainadmin or mainadmin@iceflow.app"
              autoComplete="username"
            />
            <p className="mt-1 text-xs text-ice-500">
              Sign in with username or email · data lives on Supabase Postgres (access from anywhere)
            </p>
          </div>
          <div>
            <label className="label">{t('auth.password')}</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {needs2fa && (
            <div>
              <label className="label">Two-factor code</label>
              <input className="input" value={totp} onChange={(e) => setTotp(e.target.value)} placeholder="000000" />
            </div>
          )}
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? t('common.loading') : t('auth.login')}
          </button>
          <div className="rounded-xl bg-ice-50 p-3 text-xs text-ice-600 space-y-1">
            <div>
              Demo Main: <code>mainadmin</code> or <code>mainadmin@iceflow.app</code> / <code>IceFlow@Main2026</code>
            </div>
            <div>
              Demo Sub: <code>madhapur</code> or <code>madhapur@iceflow.app</code> / <code>Branch@007</code>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
