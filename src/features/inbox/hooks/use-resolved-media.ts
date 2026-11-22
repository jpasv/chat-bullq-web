'use client';

import { useEffect, useRef, useState } from 'react';
import { inboxService, type Message } from '../services/inbox.service';
import { mediaErrorMessage, needsServerResolve } from '../utils/media-url';

type ResolveMode = 'eager' | 'lazy';

interface UseResolvedMediaResult {
  url: string | undefined;
  mimeType: string | undefined;
  loading: boolean;
  error: string | null;
  /** Forces a fresh resolve — call when an <img>/<video> errors out (e.g. cached URL expired). */
  retry: () => Promise<void>;
}

/**
 * Single source of truth for "give me a playable URL for this message".
 *
 * Inbound media arrives in different shapes per channel:
 *   - Zappfy (Uazapi): webhook stores an encrypted .enc URL the browser can't play.
 *   - WhatsApp Cloud: webhook stores only a mediaId; the actual URL needs a Bearer token.
 *   - Instagram: webhook already gives a public CDN URL.
 *
 * The backend's `/messages/:id/media` endpoint hides those differences — it
 * resolves and caches a playable URL on the message. This hook calls it
 * lazily (on first need) for inbound messages whose `content.mediaUrl` is
 * absent or looks unplayable.
 *
 * Outbound messages already point at our own /api/v1/uploads URL so this
 * hook short-circuits and uses that directly.
 */
export function useResolvedMedia(
  message: Message,
  options: { mode?: ResolveMode } = {},
): UseResolvedMediaResult {
  const mode = options.mode ?? 'lazy';

  const initial = pickInitialUrl(message);
  const [url, setUrl] = useState<string | undefined>(initial);
  const [mimeType, setMimeType] = useState<string | undefined>(
    typeof message.content?.mimeType === 'string'
      ? message.content.mimeType
      : undefined,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  // Reset cached URL when the message id changes (e.g., key reused in a list).
  useEffect(() => {
    const next = pickInitialUrl(message);
    setUrl(next);
    setMimeType(
      typeof message.content?.mimeType === 'string'
        ? message.content.mimeType
        : undefined,
    );
    setError(null);
  }, [message.id, message.content?.mediaUrl, message.content?.mimeType]);

  const doResolve = async (force = false) => {
    if (!message.id) return;
    if (loading) {
      // Coalesce concurrent calls (e.g., multiple <img>s on the same message).
      if (inflightRef.current) await inflightRef.current;
      return;
    }
    if (!force && url && !looksUnplayable(url)) return;

    setLoading(true);
    setError(null);
    const p = (async () => {
      try {
        const resolved = await inboxService.resolveMediaUrl(message.id);
        setUrl(resolved.url);
        if (resolved.mimeType) setMimeType(resolved.mimeType);
      } catch (err: any) {
        setError(mediaErrorMessage(err, 'Não foi possível carregar a mídia'));
      } finally {
        setLoading(false);
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    await p;
  };

  // Eager mode: resolve immediately if we don't have a playable URL yet. Use
  // sparingly — for media that always renders (audio thumbnails). Most
  // components use lazy mode and call retry() on <img>/<video> error.
  useEffect(() => {
    if (mode !== 'eager') return;
    if (url && !looksUnplayable(url)) return;
    void doResolve(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, message.id]);

  return {
    url,
    mimeType,
    loading,
    error,
    retry: () => doResolve(true),
  };
}

function pickInitialUrl(message: Message): string | undefined {
  const u = message.content?.mediaUrl;
  if (typeof u !== 'string' || !u) return undefined;
  if (looksUnplayable(u)) return undefined;
  return u;
}

/** Ver needsServerResolve: .enc do WhatsApp e link temporário da Uazapi. */
function looksUnplayable(u: string): boolean {
  return needsServerResolve(u);
}
