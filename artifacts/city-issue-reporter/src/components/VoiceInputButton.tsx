import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import type { LanguageCode } from '../i18n';
import { useLanguage } from '../i18n';

type RecognitionResult = { isFinal: boolean; 0?: { transcript?: string } };
type RecognitionResults = { length: number; [index: number]: RecognitionResult };
type RecognitionEvent = Event & { results: RecognitionResults };
type RecognitionErrorEvent = Event & { error: string };
type SpeechRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognizerConstructor = new () => SpeechRecognizer;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognizerConstructor;
  webkitSpeechRecognition?: SpeechRecognizerConstructor;
};

const speechLocales: Record<LanguageCode, string> = {
  en: 'en-US',
  ar: 'ar-SA',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  fil: 'fil-PH',
  hi: 'hi-IN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fa: 'fa-IR',
  'pt-BR': 'pt-BR',
  ru: 'ru-RU',
  es: 'es-US',
  vi: 'vi-VN',
};

let activeRecognizer: SpeechRecognizer | undefined;

type Props = {
  field: string;
  onTranscript: (transcript: string) => boolean | void;
  disabled?: boolean;
  testId?: string;
};

export default function VoiceInputButton({ field, onTranscript, disabled = false, testId }: Props) {
  const { language, t } = useLanguage();
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [message, setMessage] = useState('');
  const recognizerRef = useRef<SpeechRecognizer | undefined>(undefined);
  const transcriptHandler = useRef(onTranscript);
  const mounted = useRef(true);
  transcriptHandler.current = onTranscript;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelListening();
    };
  }, []);
  useEffect(() => {
    if (disabled) cancelListening();
    return () => cancelListening();
  }, [language, disabled]);
  useEffect(() => {
    const stopWhenHidden = () => { if (document.hidden) cancelListening(); };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => document.removeEventListener('visibilitychange', stopWhenHidden);
  }, []);

  const cancelListening = () => {
    const recognizer = recognizerRef.current;
    recognizerRef.current = undefined;
    if (activeRecognizer === recognizer) activeRecognizer = undefined;
    if (recognizer) {
      try { recognizer.abort(); } catch { /* Recognition may already have ended. */ }
    }
    if (mounted.current) {
      setListening(false);
      setInterimTranscript('');
    }
  };

  const startOrStop = () => {
    const current = recognizerRef.current;
    if (listening && current) {
      try { current.stop(); } catch { finishListening(current); }
      return;
    }

    const speechWindow = window as SpeechRecognitionWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setMessage(t('voiceUnsupported'));
      return;
    }

    if (activeRecognizer) {
      try { activeRecognizer.abort(); } catch { activeRecognizer = undefined; }
    }
    setMessage('');
    setInterimTranscript('');

    const recognizer = new Constructor();
    recognizerRef.current = recognizer;
    activeRecognizer = recognizer;
    recognizer.lang = speechLocales[language];
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (event) => {
      if (!mounted.current || recognizerRef.current !== recognizer || activeRecognizer !== recognizer) return;
      let finalText = '';
      let interimText = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript?.trim() ?? '';
        if (result.isFinal && text) finalText += `${finalText ? ' ' : ''}${text}`;
        else if (text) interimText += `${interimText ? ' ' : ''}${text}`;
      }
      setInterimTranscript(interimText);
      if (finalText) {
        const applied = transcriptHandler.current(finalText);
        setMessage(applied === false ? t('voiceChoiceNotFound') : '');
      }
    };
    recognizer.onerror = (event) => {
      if (!mounted.current || recognizerRef.current !== recognizer) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMessage(t('voicePermissionDenied'));
      } else if (event.error === 'no-speech') {
        setMessage(t('voiceNoSpeech'));
      } else if (event.error !== 'aborted') {
        setMessage(t('voiceError'));
      }
      finishListening(recognizer);
      try { recognizer.abort(); } catch { /* Browser errors often end recognition immediately. */ }
    };
    recognizer.onend = () => finishListening(recognizer);
    setListening(true);
    try {
      // start() is called directly from the user's click to preserve browser mic permission prompts.
      recognizer.start();
    } catch {
      finishListening(recognizer);
      setMessage(t('voiceError'));
    }
  };

  const finishListening = (recognizer: SpeechRecognizer) => {
    if (recognizerRef.current !== recognizer) return;
    recognizerRef.current = undefined;
    if (activeRecognizer === recognizer) activeRecognizer = undefined;
    if (mounted.current) {
      setListening(false);
      setInterimTranscript('');
    }
  };

  return (
    <>
      <button
        type="button"
        className={`voice-input-button ${listening ? 'is-listening' : ''}`}
        onClick={startOrStop}
        disabled={disabled}
        aria-label={listening ? t('voiceStopForField', { field }) : t('voiceStartForField', { field })}
        aria-pressed={listening}
        data-testid={testId}
      >
        {listening ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
        <span>{listening ? t('voiceStop') : t('voiceButton')}</span>
      </button>
      {(listening && interimTranscript) && <span className="voice-input-feedback" role="status">{t('voiceInterim', { text: interimTranscript })}</span>}
      {message && <span className="voice-input-feedback" role={message === t('voiceUnsupported') ? 'status' : 'alert'}>{message}</span>}
      {(listening && !interimTranscript) && <span className="voice-input-feedback" role="status">{t('voiceListening')}</span>}
    </>
  );
}