import { createHash } from 'node:crypto';
import { q, q1 } from './core.mjs';

const API = 'https://api.mymemory.translated.net/get';
const PRAZO_MS = 6000;
const LOTE = 4;

const palavras = (l) => new RegExp(`(?<!\\p{L})(${l.join('|')})(?!\\p{L})`, 'giu');
const MARCAS = {
  pt: [
    palavras(['não', 'você', 'vocês', 'também', 'um', 'uma', 'com', 'pelo', 'pela', 'pelos', 'pelas', 'nós', 'isso', 'essa', 'esse', 'muito', 'às', 'ao', 'aos', 'do', 'da', 'dos', 'das', 'na', 'nas', 'em', 'é', 'e', 'o', 'os', 'mas', 'seu', 'sua', 'meu', 'minha', 'então', 'hoje', 'ele', 'ela', 'eu', 'são', 'está', 'quem', 'foi', 'nosso', 'nossa', 'como', 'seja']),
    /ção|ções|ã|õ|ç|â|ê|ô|lh|nh/giu,
  ],
  es: [
    palavras(['y', 'el', 'la', 'los', 'las', 'un', 'una', 'en', 'con', 'del', 'al', 'muy', 'también', 'usted', 'lo', 'su', 'sus', 'tu', 'nosotros', 'pero', 'mi', 'es', 'son', 'hoy', 'cómo', 'qué', 'yo', 'ella', 'nuestro', 'nuestra', 'está', 'quién', 'fue', 'cómo', 'sea', 'hay']),
    /ción|ciones|ñ|¿|¡/giu,
  ],
};
const contar = (s, rs) => rs.reduce((n, r) => n + (s.match(r) || []).length, 0);

/** Diz se o texto parece português ou espanhol (null quando não dá para saber). */
export function idiomaDoTexto(t) {
  const s = String(t || '').toLowerCase();
  const pt = contar(s, MARCAS.pt);
  const es = contar(s, MARCAS.es);
  if (pt === es) return null;
  return pt > es ? 'pt' : 'es';
}

export function idiomaPedido(req, url) {
  const v = req.headers.get('x-idioma') || url?.searchParams.get('idioma');
  return v === 'pt' || v === 'es' ? v : null;
}

/** Idioma escolhido no app: cabeçalho/parâmetro do app novo ou o último aparelho registrado (app já instalado). */
export async function idiomaDoUsuario(req, url, u) {
  const v = idiomaPedido(req, url);
  if (v) return v;
  const d = await q1('SELECT idioma FROM dispositivos WHERE usuario_id = $1 ORDER BY atualizado_em DESC LIMIT 1', [u.id]);
  return d?.idioma === 'pt' ? 'pt' : 'es';
}

let tabela;
const garantirTabela = () => (tabela ||= q(`CREATE TABLE IF NOT EXISTS traducoes (
    hash TEXT NOT NULL, para TEXT NOT NULL, texto TEXT NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (hash, para))`).catch((e) => { tabela = null; throw e; }));

const hash = (t) => createHash('sha256').update(t).digest('hex');

const ENTIDADES = { '&quot;': '"', '&#39;': "'", '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>' };
const desfazer = (t) => t.replace(/&(quot|#39|apos|amp|lt|gt);/g, (m) => ENTIDADES[m]);

function pedacos(t) {
  const max = 450;
  const out = [];
  for (const frase of t.match(/[^.!?…\n]+[.!?…]*\s*/g) || [t]) {
    const ultimo = out.length - 1;
    if (ultimo >= 0 && Buffer.byteLength(out[ultimo] + frase) <= max) out[ultimo] += frase;
    else if (Buffer.byteLength(frase) <= max) out.push(frase);
    else for (const palavra of frase.split(/(?<=\s)/)) {
      const u = out.length - 1;
      if (u >= 0 && Buffer.byteLength(out[u] + palavra) <= max) out[u] += palavra;
      else out.push(palavra);
    }
  }
  return out;
}

async function chamarApi(t, de, para, limite) {
  const resta = limite - Date.now();
  if (resta < 500) throw new Error('tradução: sem tempo');
  const p = new URLSearchParams({ q: t, langpair: `${de}|${para === 'pt' ? 'pt-BR' : 'es-ES'}` });
  if (process.env.TRADUCAO_EMAIL) p.set('de', process.env.TRADUCAO_EMAIL);
  const r = await fetch(`${API}?${p}`, { signal: AbortSignal.timeout(resta) });
  const d = await r.json();
  if (!r.ok || Number(d.responseStatus) !== 200 || d.quotaFinished || !d.responseData?.translatedText) throw new Error(`tradução ${d.responseStatus}: ${d.responseDetails || ''}`);
  return desfazer(d.responseData.translatedText);
}

async function traduzirLongo(t, de, para, limite) {
  const linhas = t.split('\n');
  const out = [];
  for (const linha of linhas) {
    const m = linha.match(/^(\s*(?:[•\-*]|\d+[.)])?\s*)(.*?)(\s*)$/);
    if (!m[2] || idiomaDoTexto(m[2]) === null && !/\p{L}{3}/u.test(m[2])) { out.push(linha); continue; }
    let r = '';
    for (const p of pedacos(m[2])) r += (r && !/\s$/.test(r) ? ' ' : '') + (await chamarApi(p.trim(), de, para, limite));
    out.push(m[1] + r + m[3]);
  }
  return out.join('\n');
}

/**
 * Traduz textos escritos pela equipe para o idioma do app (português <-> espanhol).
 * Guarda cada tradução no banco; o que não der tempo de traduzir volta como está e fica para o próximo acesso.
 */
export async function traduzirVarios(textos, para, prazoMs = PRAZO_MS) {
  const mapa = new Map();
  const outro = para === 'pt' ? 'es' : 'pt';
  const pendentes = [...new Set(textos.filter((t) => typeof t === 'string' && t.trim()))].filter((t) => idiomaDoTexto(t) === outro);
  if (!pendentes.length) return mapa;
  try {
    await garantirTabela();
    const hs = pendentes.map(hash);
    for (const l of await q('SELECT hash, texto FROM traducoes WHERE para = $1 AND hash = ANY($2::text[])', [para, hs])) {
      mapa.set(pendentes[hs.indexOf(l.hash)], l.texto);
    }
    const faltam = pendentes.filter((t) => !mapa.has(t));
    const limite = Date.now() + prazoMs;
    for (let i = 0; i < faltam.length && Date.now() < limite; i += LOTE) {
      await Promise.all(faltam.slice(i, i + LOTE).map(async (t) => {
        try {
          const tr = await traduzirLongo(t, outro, para, limite);
          mapa.set(t, tr);
          await q('INSERT INTO traducoes (hash, para, texto) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [hash(t), para, tr]);
        } catch (e) {
          console.error('traducao', e.message);
        }
      }));
    }
  } catch (e) {
    console.error('traducao', e);
  }
  return mapa;
}

export async function traduzir(t, para) {
  return (await traduzirVarios([t], para)).get(t) ?? t;
}

/** Troca, nos objetos, os campos de texto indicados pela tradução no idioma pedido. */
export async function traduzirCampos(objs, campos, para) {
  const lista = objs.filter(Boolean);
  const textos = [];
  for (const o of lista) for (const c of campos) {
    if (Array.isArray(o[c])) textos.push(...o[c]);
    else textos.push(o[c]);
  }
  const mapa = await traduzirVarios(textos, para);
  if (!mapa.size) return objs;
  for (const o of lista) for (const c of campos) {
    if (Array.isArray(o[c])) o[c] = o[c].map((v) => mapa.get(v) ?? v);
    else if (mapa.has(o[c])) o[c] = mapa.get(o[c]);
  }
  return objs;
}
