import { io, Socket } from 'socket.io-client';
import { API_BASE, isInvalidSession, refreshSession } from './session';

let socket: Socket | null = null;
let recoverTimer: ReturnType<typeof setTimeout> | null = null;
let recoverAttempts = 0;
let lastAttemptedToken: string | null = null;
let authReady = false;
let everReady = false;
const readyListeners = new Set<(ready: boolean, reconnect: boolean) => void>();

export function getSocketAuthReady() { return authReady; }
export function subscribeSocketReady(listener: (ready: boolean, reconnect: boolean) => void) {
  readyListeners.add(listener);
  return () => { readyListeners.delete(listener); };
}
function setReady(ready: boolean) {
  const reconnect = ready && everReady;
  authReady = ready;
  if (ready) everReady = true;
  for (const listener of readyListeners) {
    try { listener(ready, reconnect); } catch { /* Isola assinantes. */ }
  }
}

function readAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

function recoverFromServerDisconnect(target: Socket) {
  if (recoverTimer || socket !== target || (target.connected && authReady)) return;
  const delay = Math.min(1000 * 2 ** Math.min(recoverAttempts++, 5), 30000);
  recoverTimer = setTimeout(async () => {
    try {
      await refreshSession();
      if (socket === target) {
        recoverTimer = null;
        target.connect();
      }
    } catch (error) {
      if (socket === target) {
        recoverTimer = null;
        if (!isInvalidSession(error)) recoverFromServerDisconnect(target);
      }
    }
  }, delay);
}

export function getSocket(): Socket {
  const token = readAccessToken();

  if (socket) {
    // Deslogado o socket nasce fechado (ver autoConnect abaixo); é aqui que
    // ele abre assim que o login grava o token. Sem isto o singleton morto
    // sobrevive à navegação client-side de /login pra /inbox e o realtime
    // só volta com F5. Token igual ao da última tentativa = não insistir:
    // ou o gateway já recusou este token, ou o socket.io está reconectando
    // sozinho e não queremos atropelar.
    if (token && socket.disconnected && !recoverTimer && token !== lastAttemptedToken) {
      lastAttemptedToken = token;
      socket.connect();
    }
    return socket;
  }

  const url = API_BASE.replace('/api/v1', '');

  socket = io(url, {
    auth: (cb) => {
      const currentToken = readAccessToken();
      const organizationId = localStorage.getItem('active_org_id');
      lastAttemptedToken = currentToken;
      cb({ token: currentToken, organizationId });
    },
    transports: ['websocket', 'polling'],
    // Sem token o gateway aceita o handshake e derruba na hora, com reason
    // "io server disconnect" — que o socket.io-client NÃO reconecta sozinho.
    // Abrir aqui só serviria pra deixar o singleton morto pra sessão que
    // vem logo depois do login.
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    // Sem limite de tentativas: com reconnectionAttempts finito o socket
    // desiste PARA SEMPRE após N falhas (ex: deploy de 1min do backend)
    // e o usuário fica sem realtime até recarregar a página.
    reconnectionAttempts: Infinity,
  });

  // Marca a tentativa já na criação: o callback `auth` só roda quando o
  // handshake sai, e até lá outra montagem poderia pedir um connect() a mais.
  if (token) lastAttemptedToken = token;

  const target = socket;
  socket.on('connect', () => setReady(false));
  socket.on('disconnect', (reason) => {
    setReady(false);
    if (reason === 'io server disconnect') recoverFromServerDisconnect(target);
  });
  socket.on('ready', () => {
    recoverAttempts = 0;
    if (recoverTimer) clearTimeout(recoverTimer);
    recoverTimer = null;
    setReady(true);
  });
  if (token) socket.connect();

  return socket;
}

export function disconnectSocket() {
  if (recoverTimer) clearTimeout(recoverTimer);
  recoverTimer = null;
  recoverAttempts = 0;
  everReady = false;
  setReady(false);
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    lastAttemptedToken = null;
  }
}
