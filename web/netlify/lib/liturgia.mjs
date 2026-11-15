import { q, q1, configCompleta } from './core.mjs';

function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(ano, mes - 1, dia);
}
const DIA = 86400e3;

export function tempoLiturgico(iso) {
  const [y, mo, da] = iso.split('-').map(Number);
  const t = Date.UTC(y, mo - 1, da);
  const p = pascoa(y);
  const natal = Date.UTC(y, 11, 25);
  const advento = natal - ((new Date(natal).getUTCDay() || 7) * DIA) - 21 * DIA;
  const jan2 = Date.UTC(y, 0, 2);
  const epifania = jan2 + ((7 - new Date(jan2).getUTCDay()) % 7) * DIA;
  const epiDia = new Date(epifania).getUTCDate();
  const batismo = epiDia >= 7 ? epifania + DIA : epifania + 7 * DIA;
  if (t >= natal || t <= batismo) return 'Tempo do Natal';
  if (t >= advento) return 'Tempo do Advento';
  if (t >= p - 46 * DIA && t < p - 3 * DIA) return 'Tempo da Quaresma';
  if (t >= p - 3 * DIA && t < p) return 'Tríduo Pascal';
  if (t >= p && t <= p + 49 * DIA) return 'Tempo Pascal';
  return 'Tempo Comum';
}

function normalizar(d, iso, fonteNome) {
  const L = d.leituras || {};
  const map = (arr) => (arr || []).map((x) => ({ referencia: x.referencia || '', titulo: x.titulo || '', refrao: x.refrao || '', texto: x.texto || '' }));
  return {
    data: iso,
    titulo: d.liturgia || '',
    cor: d.cor || '',
    tempo: tempoLiturgico(iso),
    primeira_leitura: map(L.primeiraLeitura),
    salmo: map(L.salmo),
    segunda_leitura: map(L.segundaLeitura),
    evangelho: map(L.evangelho),
    reflexao: '',
    santo: '',
    fonte: fonteNome,
  };
}

export async function buscarFonte(iso) {
  const cfg = await configCompleta();
  const [y, m, dd] = iso.split('-');
  const url = new URL(cfg.liturgia_fonte);
  url.searchParams.set('dia', String(Number(dd)));
  url.searchParams.set('mes', String(Number(m)));
  url.searchParams.set('ano', y);
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('fonte ' + r.status);
  const d = await r.json();
  if (!d || !d.leituras) throw new Error('fonte sem leituras');
  return normalizar(d, iso, cfg.liturgia_fonte_nome || url.host);
}

export function dataValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
  return s;
}

export function hojeBrasil() {
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
}

export async function obterLiturgia(iso) {
  const salva = await q1("SELECT to_char(data,'YYYY-MM-DD') AS data, conteudo, fonte, manual, atualizado_em FROM liturgia WHERE data = $1", [iso]);
  if (salva) return { ...salva.conteudo, tempo: salva.conteudo.tempo || tempoLiturgico(iso), manual: salva.manual };
  try {
    const c = await buscarFonte(iso);
    await q('INSERT INTO liturgia (data, conteudo, fonte, manual) VALUES ($1,$2,$3,false) ON CONFLICT (data) DO NOTHING', [iso, JSON.stringify(c), c.fonte]);
    return { ...c, manual: false };
  } catch (e) {
    console.error('liturgia', e.message);
    return null;
  }
}
