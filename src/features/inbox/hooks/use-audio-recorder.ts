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

  // Returns a mimeType the browser *confirms* it can record, or undefined.
  // We must NOT fall back to a hard-coded type: Safari can't record webm, so
  // `new MediaRecorder(stream, { mimeType: 'audio/webm' })` throws
  // ("Invalid constraint" / NotSupportedError). When nothing is confirmed we
  // construct without options and let the browser pick its default (Safari → mp4).
  const pickSupportedMime = (): string | undefined => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      return undefined;
    }
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/ogg;codecs=opus',
    ];
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported?.(m)) return m;
    }
    return undefined;
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = pickSupportedMime();
      const recorder = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      // recorder.mimeType is the *actual* type the browser used (Safari fills
      // it with audio/mp4 when we don't pass options). Use it for the Blob so
      // the upload's Content-Type matches the real container.
      const chosenMime = recorder.mimeType || preferred || 'audio/mp4';
      setMimeType(chosenMime);
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const out = new Blob(chunksRef.current, {
          type: recorderRef.current?.mimeType || chosenMime,
        });
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
      // Surface the DOMException name too — on Safari/iOS the mic/recorder can
      // throw OverconstrainedError ("Invalid constraint"), NotSupportedError
      // (bad mimeType), or NotAllowedError. Seeing the name pins the cause.
      const name = err?.name ? `${err.name}: ` : '';
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Permissão de microfone negada'
          : `${name}${err?.message || 'Erro ao acessar microfone'}`;
      console.error('[audio-recorder] getUserMedia/MediaRecorder failed', err);
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
