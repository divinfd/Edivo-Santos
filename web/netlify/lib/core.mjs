import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

let _sql;
export function db() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}
export const q = (text, params = []) => db().query(text, params);
export const q1 = async (text, params = []) => (await q(text, params))[0] || null;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const falha = (status, msg) => { throw new HttpError(status, msg); };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, x-nome-arquivo',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
export const corsHeaders = CORS;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...headers },
  });
}

export function binario(buf, tipo = 'application/octet-stream', headers = {}) {
  return new Response(buf, { status: 200, headers: { 'content-type': tipo, ...CORS, ...headers } });
}

export function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, salt, 64);
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`;
}

export function confereSenha(senha, guardado) {
  const [alg, s, h] = String(guardado || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const esperado = Buffer.from(h, 'base64');
  const calc = crypto.scryptSync(String(senha), Buffer.from(s, 'base64'), esperado.length);
  return crypto.timingSafeEqual(esperado, calc);
}

export function validarSenha(senha) {
  const s = String(senha || '');
  if (s.length < 8 || !/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) {
    falha(400, 'A senha precisa ter pelo menos 8 caracteres, com letras e números.');
  }
  return s;
}

export function senhaTemporaria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 6; i++) s += letras[crypto.randomInt(letras.length)];
  return s + crypto.randomInt(10, 100);
}

export const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export const novoToken = () => crypto.randomBytes(32).toString('base64url');

const DURACAO = { app: 180 * 24 * 3600e3, painel: 12 * 3600e3 };

export async function criarSessao(usuarioId, origem) {
  const token = novoToken();
  const expira = new Date(Date.now() + (DURACAO[origem] || DURACAO.app));
  await q('INSERT INTO sessoes (token_hash, usuario_id, origem, expira_em) VALUES ($1,$2,$3,$4)', [sha256(token), usuarioId, origem, expira]);
  await q('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [usuarioId]);
  return token;
}

export function tokenDe(req) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export async function autenticar(req) {
  const token = tokenDe(req);
  if (!token) falha(401, 'Faça login para continuar.');
  const u = await q1(
    `SELECT u.id, u.nome, u.email, u.papel, u.status, u.telefone, u.data_nascimento, s.origem, u.ultimo_acesso
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.expira_em > now()`,
    [sha256(token)],
  );
  if (!u) falha(401, 'Sua sessão expirou. Entre novamente.');
  if (u.status !== 'ativo') falha(403, 'Sua conta não está ativa. Fale com o responsável vocacional.');
  if (!u.ultimo_acesso || Date.now() - new Date(u.ultimo_acesso).getTime() > 3600e3) {
    await q('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [u.id]);
  }
  u.token_hash = sha256(token);
  return u;
}

export async function auditar(usuario, acao, detalhe, ip) {
  try {
    await q('INSERT INTO auditoria (usuario_id, acao, detalhe, ip) VALUES ($1,$2,$3,$4)', [usuario?.id || null, acao, detalhe ? JSON.stringify(detalhe) : null, ip || null]);
  } catch (e) {
    console.error('auditoria', e);
  }
}

export async function lerJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export const texto = (v, max = 5000) => {
  const s = (v ?? '').toString().trim();
  return s.length > max ? s.slice(0, max) : s;
};

export function emailValido(e) {
  const s = texto(e, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) falha(400, 'Informe um e-mail válido.');
  return s;
}

export function idade(dataNasc) {
  if (!dataNasc) return null;
  const d = new Date(dataNasc);
  const hoje = new Date();
  let i = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) i--;
  return i;
}

export async function getConfig(chave, padrao) {
  const r = await q1('SELECT valor FROM config WHERE chave = $1', [chave]);
  return r ? r.valor : padrao;
}

export async function setConfig(chave, valor) {
  await q('INSERT INTO config (chave, valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor', [chave, JSON.stringify(valor)]);
}

export const CATEGORIAS = [
  'Orações semanais',
  'Meditações',
  'Encontros vocacionais',
  'Reflexões bíblicas',
  'Espiritualidade guanelliana',
  'Exercícios de discernimento',
  'Retiros e atividades especiais',
];

export const SECOES = {
  guanella: 'São Luís Guanella',
  congregacao: 'A Congregação',
  providencia: 'A Clara Providência',
  carisma: 'Carisma Guanelliano',
};

export const NOME_APP = 'Vocacional Hermanas Guanelianas';

export const CONFIG_PADRAO = {
  nome_app: NOME_APP,
  mensagem_espiritual: '',
  mensagem_espiritual_es: '',
  contato: { nome: '', apresentacao: '', telefone: '', whatsapp: '', email: '', encontros: '' },
  liturgia_fonte: 'https://liturgia.up.railway.app/v2/',
  liturgia_fonte_nome: 'Liturgia Diária (API pública liturgia.up.railway.app)',
};

export async function configCompleta() {
  const linhas = await q('SELECT chave, valor FROM config');
  const c = structuredClone(CONFIG_PADRAO);
  for (const l of linhas) {
    if (l.chave === 'contato') c.contato = { ...c.contato, ...l.valor };
    else c[l.chave] = l.valor;
  }
  c.nome_app = NOME_APP;
  return c;
}
