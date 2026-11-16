import { q, q1, falha, json, autenticar, auditar, texto } from './core.mjs';
import { gruposVisiveis } from './escopo.mjs';
import { notificar } from './fcm.mjs';

const DAILY = 'https://api.daily.co/v1';
const ANTECEDENCIA_MIN = 30;
const TOLERANCIA_MIN = 30;

export const videoConfigurado = () => !!process.env.DAILY_API_KEY;

export const MINUTOS_GRATIS = 10000;
const LIMITE_MIN = Number(process.env.VIDEO_LIMITE_MINUTOS) || 9000;

async function daily(metodo, caminho, corpo) {
  if (!videoConfigurado()) falha(503, 'As chamadas de vídeo ainda não foram configuradas no servidor.');
  const r = await fetch(DAILY + caminho, {
    method: metodo,
    headers: { authorization: `Bearer ${process.env.DAILY_API_KEY}`, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok && !(metodo === 'DELETE' && r.status === 404)) {
    console.error('daily', metodo, caminho, r.status, d);
    falha(502, 'O serviço de vídeo não respondeu. Tente novamente em instantes.');
  }
  return d;
}

const inicioMes = () => {
  const d = new Date();
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
};

let usoCache;
export async function minutosUsadosMes() {
  const mes = inicioMes();
  if (usoCache?.mes === mes && Date.now() - usoCache.t < 60000) return usoCache.v;
  const agora = Date.now() / 1000;
  let seg = 0;
  let depois = '';
  for (let pagina = 0; pagina < 50; pagina++) {
    const d = await daily('GET', `/meetings?timeframe_start=${mes}&limit=100${depois && `&starting_after=${encodeURIComponent(depois)}`}`);
    const lista = d.data || [];
    for (const m of lista) for (const p of m.participants || []) seg += Number(p.duration) || Math.max(0, agora - Number(p.join_time || agora));
    if (lista.length < 100) break;
    depois = lista[lista.length - 1].id;
  }
  usoCache = { mes, t: Date.now(), v: Math.ceil(seg / 60) };
  return usoCache.v;
}

// Cada acesso reserva o tempo até o fim do token; enquanto a pessoa está na sala (ou acabou de receber
// o acesso), esse tempo conta como já gasto. Assim a soma nunca passa do limite mensal.
async function fimPermitido(e, u) {
  const agora = Math.floor(Date.now() / 1000);
  const [usados, presenca, acessos] = await Promise.all([
    minutosUsadosMes(),
    daily('GET', '/presence'),
    q(`SELECT sala, usuario_id, ate, criado_em > now() - interval '2 minutes' AS recente FROM video_acessos WHERE ate > $1`, [agora]),
  ]);
  const presentes = new Set(Object.values(presenca || {}).flat().map((p) => `${p.room}:${p.userId}`));
  let reservado = 0;
  for (const a of acessos) {
    if (a.sala === e.sala && a.usuario_id === u.id) continue;
    if (a.recente || presentes.has(`${a.sala}:${a.usuario_id}`)) reservado += (Number(a.ate) - agora) / 60;
  }
  const livre = Math.floor(LIMITE_MIN - usados - reservado);
  if (livre < 5) falha(429, 'O limite mensal de minutos de vídeo gratuitos foi atingido. As salas voltam a abrir no início do próximo mês.');
  const ate = Math.min(expiraSala(e), agora + livre * 60);
  await q(
    `INSERT INTO video_acessos (sala, usuario_id, ate) VALUES ($1, $2, $3)
      ON CONFLICT (sala, usuario_id) DO UPDATE SET ate = EXCLUDED.ate, criado_em = now()`,
    [e.sala, u.id, ate],
  );
  return ate;
}

let tabela;
function garantirTabela() {
  tabela ||= q(`CREATE TABLE IF NOT EXISTS encontros (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      inicio TIMESTAMPTZ NOT NULL,
      duracao_min INT NOT NULL DEFAULT 60,
      para_todos BOOLEAN NOT NULL DEFAULT false,
      grupos INT[] NOT NULL DEFAULT '{}',
      sala TEXT,
      sala_url TEXT,
      lembrete_enviado BOOLEAN NOT NULL DEFAULT false,
      criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
    .then(() => q(`CREATE TABLE IF NOT EXISTS video_acessos (
      sala TEXT NOT NULL,
      usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      ate BIGINT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (sala, usuario_id)
    )`))
    .catch((e) => { tabela = null; throw e; });
  return tabela;
}

const fim = (e) => new Date(new Date(e.inicio).getTime() + e.duracao_min * 60000);
const expiraSala = (e) => Math.floor(fim(e).getTime() / 1000) + TOLERANCIA_MIN * 60;

function situacao(e, agora = Date.now()) {
  const ini = new Date(e.inicio).getTime();
  if (agora > fim(e).getTime() + TOLERANCIA_MIN * 60000) return 'encerrado';
  if (agora >= ini - ANTECEDENCIA_MIN * 60000) return 'aberto';
  return 'agendado';
}

const publico = (e) => ({ id: e.id, titulo: e.titulo, descricao: e.descricao, inicio: e.inicio, duracao_min: e.duracao_min, situacao: situacao(e) });

const SQL_VISIVEL_JOVEM = `(e.para_todos OR EXISTS (SELECT 1 FROM grupo_membros gm WHERE gm.usuario_id = $1 AND gm.grupo_id = ANY(e.grupos)))`;

async function equipe(req) {
  const u = await autenticar(req);
  if (u.papel !== 'admin' && u.papel !== 'responsavel') falha(403, 'Acesso restrito aos responsáveis vocacionais.');
  return u;
}

async function exigeEncontroPainel(u, id) {
  await garantirTabela();
  const e = await q1('SELECT * FROM encontros WHERE id = $1', [Number(id) || 0]);
  if (!e) falha(404, 'Encontro não encontrado.');
  if (u.papel === 'admin' || e.criado_por === u.id) return e;
  const meus = await gruposVisiveis(u);
  if (e.para_todos || e.grupos.some((g) => meus.includes(g))) return e;
  falha(404, 'Encontro não encontrado.');
}

async function dadosEncontro(u, body) {
  const titulo = texto(body.titulo, 150);
  if (!titulo) falha(400, 'Informe o título do encontro.');
  const inicio = new Date(body.inicio);
  if (isNaN(inicio)) falha(400, 'Informe o dia e a hora do encontro.');
  const duracao = Math.round(Number(body.duracao_min) || 60);
  if (duracao < 15 || duracao > 240) falha(400, 'A duração deve ser entre 15 minutos e 4 horas.');
  let paraTodos = body.para_todos === true;
  let grupos = Array.isArray(body.grupos) ? [...new Set(body.grupos.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
  if (u.papel !== 'admin') {
    const meus = await gruposVisiveis(u);
    paraTodos = false;
    grupos = grupos.filter((g) => meus.includes(g));
    if (!grupos.length) falha(400, 'Escolha pelo menos um dos seus grupos.');
  } else if (paraTodos) grupos = [];
  else if (!grupos.length) falha(400, 'Escolha "Todos os jovens" ou pelo menos um grupo.');
  return { titulo, descricao: texto(body.descricao, 1000), inicio, duracao_min: duracao, para_todos: paraTodos, grupos };
}

function fmtHora(d, idioma) {
  return new Date(d).toLocaleString(idioma === 'es' ? 'es-AR' : 'pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

async function avisar(e, autor, lembrete = false) {
  return notificar({
    titulo: lembrete ? `O encontro "${e.titulo}" vai começar` : 'Novo encontro por vídeo',
    corpo: lembrete ? 'A sala já está aberta. Toque para entrar.' : `${e.titulo} — ${fmtHora(e.inicio, 'pt')}`,
    tituloEs: lembrete ? `El encuentro "${e.titulo}" va a comenzar` : 'Nuevo encuentro por video',
    corpoEs: lembrete ? 'La sala ya está abierta. Toca para entrar.' : `${e.titulo} — ${fmtHora(e.inicio, 'es')}`,
    paraTodos: e.para_todos,
    grupos: e.grupos,
    autor,
    dados: { tipo: 'encontro' },
  });
}

async function token(e, u, dono, idioma) {
  const ate = await fimPermitido(e, u);
  const t = await daily('POST', '/meeting-tokens', {
    properties: {
      room_name: e.sala,
      user_name: texto(u.nome, 60) || 'Participante',
      user_id: String(u.id),
      is_owner: dono,
      exp: ate,
      eject_at_token_exp: true,
      lang: idioma === 'pt' ? 'pt' : 'es',
    },
  });
  return t.token;
}

export async function encontroAberto(usuarioId) {
  await garantirTabela();
  const e = await q1(
    `SELECT e.id, e.titulo FROM encontros e WHERE ${SQL_VISIVEL_JOVEM} AND e.sala_url IS NOT NULL
        AND now() >= e.inicio - interval '${ANTECEDENCIA_MIN} minutes'
        AND now() <= e.inicio + make_interval(mins => e.duracao_min + ${TOLERANCIA_MIN})
      ORDER BY e.inicio LIMIT 1`,
    [usuarioId],
  );
  return e || null;
}

export async function lembretesEncontros() {
  if (!videoConfigurado()) return 0;
  await garantirTabela();
  const lista = await q(
    `UPDATE encontros SET lembrete_enviado = true
      WHERE NOT lembrete_enviado AND inicio <= now() + interval '15 minutes' AND inicio > now() - interval '15 minutes'
      RETURNING *`,
  );
  for (const e of lista) {
    try {
      await avisar(e, null, true);
    } catch (err) {
      console.error('lembrete encontro', e.id, err);
      await q('UPDATE encontros SET lembrete_enviado = false WHERE id = $1', [e.id]).catch(() => {});
    }
  }
  return lista.length;
}

export default function (r) {
  r('GET', '/painel/encontros', async ({ req }) => {
    const u = await equipe(req);
    await garantirTabela();
    const meus = await gruposVisiveis(u);
    const lista = await q(
      `SELECT e.*, u.nome AS criado_por_nome FROM encontros e LEFT JOIN usuarios u ON u.id = e.criado_por
        WHERE e.inicio > now() - interval '30 days'
          AND ($1::int[] IS NULL OR e.criado_por = $2 OR e.para_todos OR e.grupos && $1::int[])
        ORDER BY e.inicio DESC`,
      [meus, u.id],
    );
    const uso = videoConfigurado() ? await minutosUsadosMes().catch(() => null) : null;
    return json({ configurado: videoConfigurado(), uso: { usados: uso, limite: LIMITE_MIN, gratis: MINUTOS_GRATIS }, lista: lista.map((e) => ({ ...e, sala_url: undefined, situacao: situacao(e) })) });
  });

  r('POST', '/painel/encontros', async ({ req, body, ip }) => {
    const u = await equipe(req);
    await garantirTabela();
    const d = await dadosEncontro(u, body);
    if (fim(d).getTime() < Date.now()) falha(400, 'Esse horário já passou.');
    const e = await q1(
      `INSERT INTO encontros (titulo, descricao, inicio, duracao_min, para_todos, grupos, criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.titulo, d.descricao, d.inicio, d.duracao_min, d.para_todos, d.grupos, u.id],
    );
    try {
      const sala = await daily('POST', '/rooms', {
        name: `encontro-${e.id}-${Math.random().toString(36).slice(2, 8)}`,
        privacy: 'private',
        properties: { exp: expiraSala(e), eject_at_room_exp: true, enable_chat: true, enable_knocking: false, enable_screenshare: true, enable_prejoin_ui: true },
      });
      await q('UPDATE encontros SET sala = $1, sala_url = $2 WHERE id = $3', [sala.name, sala.url, e.id]);
    } catch (err) {
      await q('DELETE FROM encontros WHERE id = $1', [e.id]);
      throw err;
    }
    await auditar(u, 'encontro_criado', `${e.id}: ${e.titulo}`, ip);
    if (body.notificar !== false) await avisar(e, u);
    return json(publico(e), 201);
  });

  r('DELETE', '/painel/encontros/:id', async ({ req, params, ip }) => {
    const u = await equipe(req);
    const e = await exigeEncontroPainel(u, params.id);
    if (u.papel !== 'admin' && e.criado_por !== u.id) falha(403, 'Somente quem criou este encontro (ou um administrador) pode excluí-lo.');
    if (e.sala) await daily('DELETE', `/rooms/${encodeURIComponent(e.sala)}`).catch((err) => console.error('daily delete', err));
    await q('DELETE FROM encontros WHERE id = $1', [e.id]);
    await auditar(u, 'encontro_excluido', `${e.id}: ${e.titulo}`, ip);
    return json({ ok: true });
  });

  r('POST', '/painel/encontros/:id/entrar', async ({ req, params }) => {
    const u = await equipe(req);
    const e = await exigeEncontroPainel(u, params.id);
    if (situacao(e) === 'encerrado') falha(410, 'Este encontro já terminou.');
    if (!e.sala_url) falha(409, 'A sala deste encontro não foi criada.');
    return json({ url: e.sala_url, token: await token(e, u, true, 'pt') });
  });

  r('GET', '/app/encontros', async ({ req }) => {
    const u = await autenticar(req);
    await garantirTabela();
    const lista = await q(
      `SELECT e.* FROM encontros e WHERE ${SQL_VISIVEL_JOVEM}
          AND e.inicio + make_interval(mins => e.duracao_min + ${TOLERANCIA_MIN}) > now()
        ORDER BY e.inicio`,
      [u.id],
    );
    return json(lista.map(publico));
  });

  r('POST', '/app/encontros/:id/entrar', async ({ req, params, body }) => {
    const u = await autenticar(req);
    await garantirTabela();
    const e = await q1(`SELECT e.* FROM encontros e WHERE e.id = $2 AND ${SQL_VISIVEL_JOVEM}`, [u.id, Number(params.id) || 0]);
    if (!e) falha(404, 'Encontro não encontrado.');
    const s = situacao(e);
    if (s === 'agendado') falha(409, `A sala abre ${ANTECEDENCIA_MIN} minutos antes do encontro.`);
    if (s === 'encerrado') falha(410, 'Este encontro já terminou.');
    if (!e.sala_url) falha(409, 'A sala deste encontro não foi criada.');
    const dono = u.papel === 'admin' || u.papel === 'responsavel';
    return json({ url: e.sala_url, token: await token(e, u, dono, body.idioma) });
  });
}
