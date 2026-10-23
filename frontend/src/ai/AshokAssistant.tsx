import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Mic,
  MessageCircle,
  X,
  Minimize2,
  Volume2,
  VolumeX,
  HelpCircle,
  BookOpen,
  GripVertical,
} from 'lucide-react';
import api from '../services/api';
import { LANG_OPTIONS } from '../i18n';
import i18n from '../i18n';
import clsx from 'clsx';

type MicStatus =
  | 'mic_off'
  | 'listening_wake'
  | 'wake_detected'
  | 'listening_command'
  | 'processing'
  | 'confirmation_needed'
  | 'saving'
  | 'saved'
  | 'error';

interface DraftAction {
  employeeId?: string;
  employeeName?: string;
  itemId?: string;
  itemName?: string;
  action?: string;
  quantity?: number;
  sessionId?: string;
  status?: string;
}

interface ChatMsg {
  role: 'user' | 'ashok';
  text: string;
  at: string;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition;
    SpeechRecognition?: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

const SPEECH_LANG: Record<string, string> = {
  en: 'en-IN',
  te: 'te-IN',
  hi: 'hi-IN',
  ml: 'ml-IN',
  kn: 'kn-IN',
  ta: 'ta-IN',
  or: 'or-IN',
  mr: 'mr-IN',
};

export default function AshokAssistant() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>('mic_off');
  const [transcript, setTranscript] = useState('');
  const [livePartial, setLivePartial] = useState('');
  const [draft, setDraft] = useState<DraftAction | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<DraftAction[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const [dragging, setDragging] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ llm: boolean; provider: string; model: string } | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);
  const voiceModeRef = useRef(false);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  // Default voice OFF after login/refresh
  useEffect(() => {
    setVoiceMode(false);
    setMicStatus('mic_off');
  }, []);

  useEffect(() => {
    if (!open) return;
    void api
      .get('/ashok/status')
      .then((r) => setLlmStatus(r.data.data))
      .catch(() => setLlmStatus({ llm: false, provider: 'database', model: 'offline' }));
  }, [open]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[i18n.language] || 'en-IN';
    window.speechSynthesis.speak(u);
  }, []);

  const stopSpeaking = () => window.speechSynthesis?.cancel();

  const processTranscript = useCallback(
    async (text: string) => {
      setTranscript(text);
      setMicStatus('processing');
      try {
        const { data } = await api.post('/ashok/parse', {
          transcript: text,
          language: i18n.language,
        });
        const resolved = data.data;
        const action = resolved.action;
        if (!resolved.parsed.wakeWord) {
          setMicStatus('listening_wake');
          setChat((c) => [
            ...c,
            { role: 'ashok', text: t('ashok.waiting'), at: new Date().toISOString() },
          ]);
          return;
        }
        setMicStatus('wake_detected');
        // Stock drafts keep voice parse; questions go to live DB + Ollama
        const intent = resolved.parsed?.intent as string | undefined;
        if (!action || intent === 'unknown' || intent === 'help') {
          const { data: chatData } = await api.post('/ashok/chat', {
            message: text.replace(/^(ashok|అశోక్|अशोक)\s*/i, '').trim() || text,
            language: i18n.language,
          });
          const reply = (chatData.data.reply as string) || 'No data.';
          speak(reply);
          setChat((c) => [
            ...c,
            { role: 'user', text, at: new Date().toISOString() },
            { role: 'ashok', text: reply, at: new Date().toISOString() },
          ]);
          setMicStatus(voiceModeRef.current ? 'listening_wake' : 'mic_off');
          return;
        }
        if (action?.speak) speak(action.speak);
        setChat((c) => [
          ...c,
          { role: 'user', text, at: new Date().toISOString() },
          { role: 'ashok', text: action?.speak || 'OK', at: new Date().toISOString() },
        ]);
        if (action?.type === 'draft_entry' && action.draft) {
          setDraft(action.draft);
          setPendingDrafts((p) => [...p, action.draft]);
          setMicStatus('confirmation_needed');
        } else if (action?.type === 'read_stock') {
          setMicStatus('saved');
        } else {
          setMicStatus(voiceModeRef.current ? 'listening_wake' : 'mic_off');
        }
      } catch {
        setMicStatus('error');
        speak('Sorry, I could not understand that.');
      }
    },
    [speak, t]
  );

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (!voiceMode) {
      recogRef.current?.stop();
      setMicStatus('mic_off');
      return;
    }

    const recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = SPEECH_LANG[i18n.language] || 'en-IN';
    recogRef.current = recog;
    setMicStatus('listening_wake');

    recog.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setLivePartial(interim || finalText);
      const combined = (finalText || interim).trim();
      if (/ashok|అశోక్|अशोक|അശോക്|ಅಶೋಕ್|அசோக்|ଅଶୋକ/i.test(combined)) {
        setMicStatus('wake_detected');
      }
      if (finalText.trim()) {
        setMicStatus('listening_command');
        void processTranscript(finalText.trim());
      }
    };
    recog.onerror = () => setMicStatus('error');
    recog.onend = () => {
      if (voiceModeRef.current) {
        try {
          recog.start();
        } catch {
          /* already started */
        }
      }
    };
    try {
      recog.start();
    } catch {
      /* ignore */
    }

    return () => {
      recog.onend = null;
      try {
        recog.stop();
      } catch {
        /* ignore */
      }
    };
  }, [voiceMode, processTranscript]);

  const sendChat = async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    setChat((c) => [...c, { role: 'user', text: msg, at: new Date().toISOString() }]);
    const { data } = await api.post('/ashok/chat', { message: msg, language: i18n.language });
    const reply = data.data.reply as string;
    setChat((c) => [...c, { role: 'ashok', text: reply, at: new Date().toISOString() }]);
    speak(reply);
  };

  const confirmDraft = async (mode: 'save' | 'cancel' | 'edit') => {
    if (mode === 'cancel') {
      setDraft(null);
      setPendingDrafts([]);
      setMicStatus(voiceMode ? 'listening_wake' : 'mic_off');
      speak('Draft cancelled.');
      return;
    }
    if (mode === 'edit') {
      speak('Which item should I change? Say Ashok edit employee item quantity.');
      setMicStatus('listening_command');
      return;
    }
    // Save requires explicit confirmation — apply stock-out/in via session APIs
    if (!draft?.sessionId || !draft.itemId || draft.quantity == null) {
      speak('Nothing to save yet.');
      return;
    }
    setMicStatus('saving');
    try {
      if (draft.action === 'stock_out') {
        await api.post(`/sessions/${draft.sessionId}/stock-out`, {
          lines: [{ itemId: draft.itemId, quantity: draft.quantity, entrySource: 'voice' }],
        });
      } else if (draft.action === 'stock_in') {
        await api.post(`/sessions/${draft.sessionId}/stock-in`, {
          lines: [{ itemId: draft.itemId, stockInQty: draft.quantity, entrySource: 'voice' }],
          payments: {},
          finalize: false,
        });
      }
      setMicStatus('saved');
      speak('Saved successfully.');
      setDraft(null);
      setPendingDrafts([]);
      // Refresh employee board so voice Out/In appears immediately
      window.dispatchEvent(new CustomEvent('iceflow:board-refresh'));
      setTimeout(() => setMicStatus(voiceMode ? 'listening_wake' : 'mic_off'), 1200);
    } catch (e: unknown) {
      setMicStatus('error');
      const err = e as { response?: { data?: { error?: string } } };
      speak(err.response?.data?.error || 'Save failed. Please confirm on screen.');
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragRef.current = { ox: e.clientX, oy: e.clientY, sx: pos.x, sy: pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragRef.current) return;
    const dx = dragRef.current.ox - e.clientX;
    const dy = dragRef.current.oy - e.clientY;
    setPos({
      x: Math.max(8, dragRef.current.sx + dx),
      y: Math.max(8, dragRef.current.sy + dy),
    });
  };
  const onPointerUp = () => {
    setDragging(false);
    dragRef.current = null;
  };

  const statusLabel = useMemo(() => {
    const map: Record<MicStatus, string> = {
      mic_off: 'Mic off',
      listening_wake: t('ashok.listening'),
      wake_detected: 'Wake word detected',
      listening_command: 'Listening to command',
      processing: t('ashok.processing'),
      confirmation_needed: t('ashok.confirmNeeded'),
      saving: 'Saving',
      saved: 'Saved',
      error: 'Error / Could not understand',
    };
    return map[micStatus];
  }, [micStatus, t]);

  const fabStyle: React.CSSProperties = {
    right: pos.x,
    bottom: `calc(${pos.y}px + env(safe-area-inset-bottom, 0px))`,
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        aria-label="Ashok AI"
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={fabStyle}
        className={clsx(
          'fixed z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-ice-800 text-white shadow-soft transition hover:bg-ice-900 md:h-16 md:w-16',
          voiceMode && 'animate-pulse-mic',
          micStatus === 'listening_wake' || micStatus === 'listening_command'
            ? 'ring-4 ring-sky-300'
            : ''
        )}
      >
        <span className="relative">
          <Mic className="h-5 w-5 absolute -left-1 -top-1 opacity-90" />
          <MessageCircle className="h-6 w-6 ml-2 mt-1" />
        </span>
        <span className="sr-only">{t('ashok.title')}</span>
      </button>

      {open && !minimized && (
        <div
          className="fixed z-[90] flex w-[min(100vw-1rem,420px)] flex-col overflow-hidden rounded-2xl border border-ice-100 bg-white/95 shadow-2xl backdrop-blur-xl animate-float-in"
          style={{
            right: Math.max(8, pos.x - 8),
            bottom: `calc(${pos.y + 72}px + env(safe-area-inset-bottom, 0px))`,
            maxHeight: 'min(78vh, 640px)',
          }}
        >
          <header className="flex items-center gap-3 border-b border-ice-100 bg-gradient-to-r from-ice-900 to-ice-700 px-4 py-3 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 font-display text-lg">
              A
            </div>
            <div className="flex-1">
              <div className="font-display text-lg leading-tight">{t('ashok.title')}</div>
              <div className="text-xs text-sky-100">{statusLabel}</div>
              <div className="text-[10px] text-sky-200/90">
                {llmStatus?.llm
                  ? `Ollama · ${llmStatus.model} · answers from live DB`
                  : 'Live DB answers (start Ollama + llama3.2 for chat AI)'}
              </div>
            </div>
            <GripVertical className="h-4 w-4 opacity-60" />
            <button type="button" className="rounded-lg p-1 hover:bg-white/10" onClick={() => setMinimized(true)}>
              <Minimize2 className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-lg p-1 hover:bg-white/10" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-3 overflow-y-auto p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input !py-1.5 !text-xs w-auto"
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
              <button
                type="button"
                className={clsx(
                  'btn text-xs',
                  voiceMode ? 'bg-emerald-600 text-white' : 'btn-ghost'
                )}
                onClick={() => setVoiceMode((v) => !v)}
              >
                {voiceMode ? t('ashok.voiceOn') : t('ashok.voiceOff')}
              </button>
            </div>

            {voiceMode && (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-ice-800">{t('ashok.wakeHint')}</p>
            )}

            {/* Voice Command Bar */}
            <div className="rounded-xl border border-ice-100 bg-ice-50/80 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ice-600">
                <span>Voice Command Bar</span>
                {(micStatus === 'listening_wake' || micStatus === 'listening_command') && (
                  <span className="inline-flex items-center gap-1 text-rose-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Mic active
                  </span>
                )}
              </div>
              <div className="text-xs text-ice-700">Status: {statusLabel}</div>
              <div className="min-h-[2.5rem] rounded-lg bg-white px-3 py-2 font-medium text-ice-950">
                {livePartial || transcript || t('ashok.waiting')}
              </div>
              {draft && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs space-y-1">
                  <div className="font-semibold text-amber-900">Parsed preview</div>
                  <div>Employee: {draft.employeeName}</div>
                  <div>Item: {draft.itemName}</div>
                  <div>Action: {draft.action}</div>
                  <div>Quantity: {draft.quantity}</div>
                  <div className="text-amber-700">{t('ashok.draft')}</div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" className="btn-primary !py-1 !text-xs" onClick={() => void confirmDraft('save')}>
                      {t('ashok.save')}
                    </button>
                    <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => void confirmDraft('edit')}>
                      {t('ashok.edit')}
                    </button>
                    <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => void confirmDraft('cancel')}>
                      {t('ashok.cancel')}
                    </button>
                  </div>
                </div>
              )}
              {pendingDrafts.length > 1 && (
                <div className="text-xs text-ice-600">{pendingDrafts.length} pending draft items</div>
              )}
            </div>

            <div className="max-h-40 space-y-2 overflow-y-auto">
              {chat.slice(-12).map((m, i) => (
                <div
                  key={`${m.at}-${i}`}
                  className={clsx(
                    'rounded-xl px-3 py-2',
                    m.role === 'ashok' ? 'bg-ice-100 text-ice-900' : 'bg-ice-800 text-white ml-6'
                  )}
                >
                  {m.text}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {['Read today’s stock', 'Show outstanding', 'Help'].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-full border border-ice-200 bg-white px-3 py-1 text-xs hover:bg-ice-50"
                  onClick={() => {
                    setInput(q);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                className="input !py-2"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Ashok…"
                onKeyDown={(e) => e.key === 'Enter' && void sendChat()}
              />
              <button type="button" className="btn-primary" onClick={() => void sendChat()}>
                Send
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost !text-xs"
                onClick={() => {
                  setInput('read stock');
                  void sendChat();
                }}
              >
                <BookOpen className="h-3.5 w-3.5" /> {t('ashok.readData')}
              </button>
              <button type="button" className="btn-ghost !text-xs" onClick={stopSpeaking}>
                <VolumeX className="h-3.5 w-3.5" /> {t('ashok.stopSpeaking')}
              </button>
              <button
                type="button"
                className="btn-ghost !text-xs"
                onClick={() => {
                  const help =
                    'Say Ashok, then employee, item, stock-in or stock-out, and quantity. Say Ashok complete name, then Save.';
                  setChat((c) => [...c, { role: 'ashok', text: help, at: new Date().toISOString() }]);
                  speak(help);
                }}
              >
                <HelpCircle className="h-3.5 w-3.5" /> {t('ashok.help')}
              </button>
              <button type="button" className="btn-ghost !text-xs" onClick={() => speak(transcript || 'Ready.')}>
                <Volume2 className="h-3.5 w-3.5" /> Replay
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
