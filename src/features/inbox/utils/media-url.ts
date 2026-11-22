/**
 * URLs de mídia que o navegador não deve usar direto — é preciso pedir ao
 * backend (`/messages/:id/media`) uma URL tocável:
 *  - `.enc` em mmg.whatsapp.net: mídia criptografada do WhatsApp;
 *  - `*.uazapi.com/files/...`: link temporário da Uazapi, morre em ~2 dias.
 *    O backend copia pro nosso disco e devolve uma URL permanente.
 */
export function needsServerResolve(url: string): boolean {
  return (
    /\.enc(\?|$)/i.test(url) ||
    /mmg\.whatsapp\.net/i.test(url) ||
    /^https?:\/\/[^/]*uazapi\.com\/files\//i.test(url)
  );
}

/** Mensagem de erro amigável de uma chamada de mídia (axios). */
export function mediaErrorMessage(err: any, fallback: string): string {
  return err?.response?.data?.message || err?.message || fallback;
}
