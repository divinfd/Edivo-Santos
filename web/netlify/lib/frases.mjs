import { q } from './core.mjs';
import { traduzir } from './traducao.mjs';

/** Frase de São Luís Guanella do dia (gira a lista de frases ativas, uma por dia, no horário de Brasília). */
export async function fraseDoDia() {
  const lista = await q("SELECT texto_pt, texto_es FROM frases WHERE ativa AND (texto_pt <> '' OR texto_es <> '') ORDER BY id");
  if (!lista.length) return null;
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dia = Math.floor(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) / 86400000);
  const f = lista[dia % lista.length];
  return { pt: f.texto_pt || f.texto_es, es: f.texto_es || f.texto_pt, texto_pt: f.texto_pt, texto_es: f.texto_es };
}

/** Junta a mensagem de boas-vindas com a frase do dia (aparece no app já instalado, sem atualização). */
export async function mensagensComFrase(c) {
  const f = await fraseDoDia();
  const noIdioma = (proprio, outro, para) => (proprio?.trim() ? proprio : outro ? traduzir(outro, para) : '');
  const [basePt, baseEs, frasePt, fraseEs] = await Promise.all([
    noIdioma(c.mensagem_espiritual, c.mensagem_espiritual_es, 'pt'),
    noIdioma(c.mensagem_espiritual_es, c.mensagem_espiritual, 'es'),
    f && noIdioma(f.texto_pt, f.texto_es, 'pt'),
    f && noIdioma(f.texto_es, f.texto_pt, 'es'),
  ]);
  const junta = (base, frase, nome) => (frase ? `${base ? base + '\n\n' : ''}“${frase}”\n— ${nome}` : base);
  return {
    mensagem_espiritual: junta(basePt, frasePt, 'São Luís Guanella'),
    mensagem_espiritual_es: junta(baseEs, fraseEs, 'San Luis Guanella'),
  };
}
