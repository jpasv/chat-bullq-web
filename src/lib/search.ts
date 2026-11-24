/**
 * Busca que ignora maiúscula/minúscula, acento e espaço sobrando: "joao",
 * "JOÃO" e " João " são o mesmo termo. Mesma regra da API
 * (chat-bullq-api: src/common/search/normalize-search.ts).
 */

/** Letras que o NFD não decompõe (não têm acento "separável"). */
const EXTRA_FROM = 'øđłħŧıð';
const EXTRA_TO = 'odlhtid';
const EXTRA_MAP = new Map([...EXTRA_FROM].map((ch, i) => [ch, EXTRA_TO[i]]));

export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return '';
  const stripped = value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const ch of stripped) out += EXTRA_MAP.get(ch) ?? ch;
  return out.replace(/\s+/g, ' ').trim();
}

/** `normalizedQuery` já passado por normalizeSearchText. */
export function textIncludes(value: string | null | undefined, normalizedQuery: string): boolean {
  return normalizeSearchText(value).includes(normalizedQuery);
}
