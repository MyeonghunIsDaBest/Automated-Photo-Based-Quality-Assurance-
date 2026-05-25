// frontend/src/pages/gantt/tabs/assistant/useVoiceInput.ts
//
// Hold-to-talk wrapper around the browser's Web Speech API. Press-and-hold
// the mic to dictate; interim transcript streams into `interim`. On
// release, `interim` becomes the final text.
//
// Browser support: Chrome / Edge / Safari (most). Firefox does NOT
// implement SpeechRecognition; the hook reports `supported: false` and
// the UI hides the mic button.

import { useCallback, useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionCtor = new () => any;

function getSpeechRecognition(): RecognitionCtor | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useVoiceInput() {
  const Ctor = getSpeechRecognition();
  const supported = Boolean(Ctor);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');

  useEffect(() => {
    return () => {
      try { recogRef.current?.stop?.(); } catch { /* noop */ }
    };
  }, []);

  const start = useCallback(() => {
    if (!Ctor || listening) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-AU';
    r.onresult = (event: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => {
      let text = '';
      for (const result of event.results as unknown as Array<{ isFinal: boolean; 0: { transcript: string } }>) {
        text += result[0]?.transcript ?? '';
      }
      setInterim(text);
    };
    r.onerror = () => { setListening(false); };
    r.onend = () => { setListening(false); };
    recogRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [Ctor, listening]);

  const stop = useCallback(() => {
    try { recogRef.current?.stop?.(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const clearInterim = useCallback(() => setInterim(''), []);

  return { supported, listening, interim, start, stop, clearInterim };
}
