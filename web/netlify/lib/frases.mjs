import { q } from './core.mjs';

/** Frase de São Luís Guanella do dia (gira a lista de frases ativas, uma por dia, no horário de Brasília). */
export async function fraseDoDia() {
  const lista = await q("SELECT texto_pt, texto_es FROM frases WHERE ativa AND (texto_pt <> '' OR texto_es <> '') ORDER BY id");
  if (!lista.length) return null;
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dia = Math.floor(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) / 86400000);
  const f = lista[dia % lista.length];
  return { pt: f.texto_pt || f.texto_es, es: f.texto_es || f.texto_pt };
}

/** Junta a mensagem de boas-vindas com a frase do dia (aparece no app já instalado, sem atualização). */
export async function mensagensComFrase(c) {
  const f = await fraseDoDia();
  const junta = (base, frase, nome) => (frase ? `${base ? base + '\n\n' : ''}“${frase}”\n— ${nome}` : base);
  return {
    mensagem_espiritual: junta(c.mensagem_espiritual, f?.pt, 'São Luís Guanella'),
    mensagem_espiritual_es: junta(c.mensagem_espiritual_es, f?.es, 'San Luis Guanella'),
  };
}
