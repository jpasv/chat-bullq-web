'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type RecordingState = 'idle' | 'recording' | 'stopped';

/**
 * Wraps the browser's MediaRecorder API with React-friendly state.
 * The hook owns the MediaStream lifecycle — it releases the microphone on
 * unmount or when the recording finishes, so the tab's mic indicator doesn't
 * stay lit after the user sends the message.
 */
export function useAudioRecorder() {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string>('audio/webm');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // O `onstop` do MediaRecorder dispara depois do cancel(): sem essa marca
  // ele reabria a prévia com o áudio que o usuário acabou de descartar.
  const discardRef = useRef(false);

  const pickMime = (): string => {
    if (typeof window === 'undefined') return 'audio/webm';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) {
        return m;
      }
    }
    return 'audio/webm';
  };

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setBlob(null);
    setElapsedMs(0);
    chunksRef.current = [];
    discardRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chosenMime = pickMime();
      setMimeType(chosenMime);
      const recorder = new MediaRecorder(stream, { mimeType: chosenMime });
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        if (discardRef.current) {
          chunksRef.current = [];
          return;
        }
        const out = new Blob(chunksRef.current, { type: chosenMime });
        setBlob(out);
        setState('stopped');
      };

      startedAtRef.current = Date.now();
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);

      recorder.start(250); // chunk every 250ms
      setState('recording');
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Permissão de microfone negada'
          : err?.message || 'Erro ao acessar microfone';
      setError(msg);
      setState('idle');
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    stop();
    setBlob(null);
    setState('idle');
    setElapsedMs(0);
    chunksRef.current = [];
  }, [stop]);

  const reset = useCallback(() => {
    setBlob(null);
    setState('idle');
    setElapsedMs(0);
    chunksRef.current = [];
  }, []);

  return { state, elapsedMs, error, blob, mimeType, start, stop, cancel, reset };
}
