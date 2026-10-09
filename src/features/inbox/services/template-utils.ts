import type { WhatsAppTemplate } from '@/features/channels/services/channels.service';
/** O envio atual suporta somente parâmetros numéricos no corpo. */
export function templateUnsupportedReason(template: WhatsAppTemplate): string | null {
  for (const component of template.components) {
    const type = String(component.type).toUpperCase();
    if (type === 'HEADER') {
      if (component.format && component.format !== 'TEXT') return 'Cabeçalho com mídia não suportado';
      if (/\{\{.*?\}\}/.test(component.text ?? '')) return 'Cabeçalho com variáveis não suportado';
    } else if (type === 'BUTTONS') {
      if (!Array.isArray(component.buttons) || component.buttons.some(button =>
        !['URL', 'PHONE_NUMBER', 'QUICK_REPLY'].includes(button.type) ||
        /\{\{.*?\}\}/.test(JSON.stringify(button)))) return 'Botão dinâmico não suportado';
    } else if (type === 'BODY') {
      const variables = [...String(component.text ?? '').matchAll(/\{\{(.*?)\}\}/g)].map(match => match[1]);
      const positions = new Set(variables.map(Number));
      if (variables.some(value => !/^[1-9]\d*$/.test(value)) || (positions.size && Math.max(...positions) !== positions.size)) return 'Variáveis do corpo devem ser numéricas e sequenciais';
    } else if (type !== 'FOOTER') {
      return 'Componente de template não suportado';
    }
  }
  return null;
}

export function templateVarCount(template: WhatsAppTemplate | undefined): number {
  const text = template?.components.find(c => c.type === 'BODY')?.text as string | undefined;
  const positions = [...(text ?? '').matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  return positions.length ? Math.max(...positions) : 0;
}
export function templateContent(template: WhatsAppTemplate, values: string[]) {
  const reason = templateUnsupportedReason(template);
  if (reason) throw new Error(reason);
  return { name: template.name, language: { code: template.language }, components: values.length ? [{ type: 'body', parameters: values.map(text => ({ type: 'text', text: text.trim() })) }] : [] };
}
