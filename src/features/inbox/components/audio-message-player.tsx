'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Loader2, Sparkles, ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { inboxService, type Message, type TranscriptionResult } from '../services/inbox.service';

const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Audio player with playback-rate control and on-demand transcription.
 *
 * Why a custom player instead of <audio controls>:
 *   - We need a rate selector in-line with the controls (per-message memory),
 *   - Native controls look different on every OS/browser,
 *   - We want the transcribe button right next to the bubble.
 */
export function AudioMessagePlayer({
  message,
  isOutbound,
  onTranscribed,
}: {
  message: Message;
  isOutbound: boolean;
  onTranscribed?: (t: TranscriptionResult) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The panel always plays a transcoded AAC/M4A rendition, never the raw
  // OGG/Opus that WhatsApp voice notes use — Safari/iOS can't decode Opus, so
  // the <audio> element loads the header but stays silent. We resolve (and
  // cache, server-side) that M4A on first play. If a previous play already
  // cached it, the socket delivers metadata.playback.url and we seed from it.
  const cachedPlaybackUrl = message.metadata?.playback?.url as string | undefined;
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(cachedPlaybackUrl);
  const [resolving, setResolving] = useState(false);
  const mediaUrl = resolvedUrl;

  useEffect(() => {
    if (message.metadata?.playback?.url) {
      setResolvedUrl(message.metadata.playback.url);
    }
  }, [message.metadata?.playback?.url]);

  const ensureResolved = async (): Promise<string | null> => {
    if (resolvedUrl) return resolvedUrl;
    setResolving(true);
    try {
      const { url } = await inboxService.getPlaybackUrl(message.id);
      setResolvedUrl(url);
      return url;
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Não foi possível carregar o áudio',
      );
      return null;
    } finally {
      setResolving(false);
    }
  };

  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptionResult | null>(
    message.metadata?.transcription ?? null,
  );
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Sync internal transcript with prop when socket pushes updated metadata.
  useEffect(() => {
    if (message.metadata?.transcription) {
      setTranscript(message.metadata.transcription);
    }
  }, [message.metadata?.transcription]);

  const colorBubble = isOutbound
    ? 'bg-primary text-primary-foreground'
    : 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100';
  const colorAccent = isOutbound
    ? 'bg-white/30'
    : 'bg-zinc-200 dark:bg-zinc-700';
  const colorAccentFilled = isOutbound
    ? 'bg-white'
    : 'bg-primary';
  const colorMuted = isOutbound
    ? 'text-primary-foreground/70'
    : 'text-zinc-500 dark:text-zinc-400';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
  }, [rate]);

  const handleTogglePlay = async () => {
    setError(null);
    try {
      if (!resolvedUrl) {
        // Lazy-resolve on first play so we don't hit the provider on every
        // audio message in the list (e.g., loading a conversation with 50 audios).
        setLoading(true);
        const url = await ensureResolved();
        if (!url) return;
        // Audio element gets the src on next render — wait a tick before playing.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        setLoading(true);
        await audio.play();
        setPlaying(true);
      } else {
        audio.pause();
        setPlaying(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao reproduzir áudio');
    } finally {
      setLoading(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const pct = Number(e.target.value);
    audio.currentTime = (pct / 100) * audio.duration;
    setCurrentTime(audio.currentTime);
  };

  const progressPct = useMemo(() => {
    if (!duration || !Number.isFinite(duration)) return 0;
    return Math.min(100, (currentTime / duration) * 100);
  }, [currentTime, duration]);

  const handleTranscribe = async () => {
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const result = await inboxService.transcribeAudio(message.id);
      setTranscript(result);
      onTranscribed?.(result);
    } catch (err: any) {
      setTranscribeError(
        err?.response?.data?.message || err?.message || 'Erro ao transcrever',
      );
    } finally {
      setTranscribing(false);
    }
  };

  // Only bail out if there's no way at all to produce a playback rendition —
  // i.e., no cached playback URL and no source the backend could transcode
  // from (raw mediaUrl/mediaId on the message, or an external id to resolve).
  // Otherwise we render the player and lazy-resolve on first play.
  const hasSource =
    !!mediaUrl ||
    !!message.content?.mediaUrl ||
    !!message.content?.mediaId ||
    !!message.externalId;
  if (!hasSource) {
    return (
      <div className={`rounded-2xl px-4 py-2.5 ${colorBubble}`}>
        <p className="text-sm italic opacity-70">🎵 Áudio indisponível</p>
      </div>
    );
  }

  return (
    <div className={`min-w-[240px] rounded-2xl px-3 py-2.5 ${colorBubble}`}>
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onError={() => setError('Falha ao carregar áudio')}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity ${
            isOutbound ? 'bg-white/20 hover:bg-white/30' : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600'
          }`}
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
        >
          {loading || resolving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-[1px]" />
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className={`relative h-1 w-full rounded-full ${colorAccent}`}>
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-[width] ${colorAccentFilled}`}
              style={{ width: `${progressPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progressPct}
              onChange={handleSeek}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className={`flex items-center justify-between text-[10px] tabular-nums ${colorMuted}`}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <Popover className="relative shrink-0">
          <PopoverButton
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium outline-none transition-colors ${
              isOutbound
                ? 'bg-white/15 hover:bg-white/25 text-primary-foreground'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-zinc-100'
            }`}
            aria-label="Velocidade de reprodução"
          >
            {rate}×
            <ChevronDown className="h-2.5 w-2.5 opacity-70" />
          </PopoverButton>
          <PopoverPanel
            anchor="bottom end"
            transition
            className="z-50 mt-1 min-w-[80px] rounded-lg border border-zinc-200/80 bg-white p-1 shadow-lg outline-none transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {({ close }) =>
              SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setRate(s); close(); }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1 text-left text-[12px] transition-colors ${
                    rate === s
                      ? 'bg-primary/[0.06] font-medium text-primary dark:bg-primary/10'
                      : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="tabular-nums">{s}×</span>
                  {rate === s && <Check className="h-3 w-3" />}
                </button>
              )) as any
            }
          </PopoverPanel>
        </Popover>
      </div>

      {error && (
        <p className={`mt-1.5 text-[11px] ${isOutbound ? 'text-primary-foreground/70' : 'text-red-500'}`}>
          {error}
        </p>
      )}

      {/* Transcription area */}
      <div className={`mt-2 flex items-center gap-2 border-t pt-2 ${
        isOutbound ? 'border-white/20' : 'border-zinc-200 dark:border-zinc-700'
      }`}>
        {!transcript && !transcribing && (
          <button
            type="button"
            onClick={handleTranscribe}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
              isOutbound
                ? 'text-primary-foreground/80 hover:bg-white/15'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            Transcrever
          </button>
        )}
        {transcribing && (
          <span className={`inline-flex items-center gap-1 text-[11px] ${colorMuted}`}>
            <Loader2 className="h-3 w-3 animate-spin" />
            Transcrevendo...
          </span>
        )}
        {transcribeError && (
          <span className="text-[11px] text-red-500">{transcribeError}</span>
        )}
      </div>

      {transcript?.text && (
        <p className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed ${
          isOutbound ? 'text-primary-foreground/95' : 'text-zinc-700 dark:text-zinc-200'
        }`}>
          {transcript.text}
        </p>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
