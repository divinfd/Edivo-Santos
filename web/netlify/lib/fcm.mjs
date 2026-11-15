import crypto from 'node:crypto';
import { q } from './core.mjs';

let cache = { token: null, exp: 0 };

function chavePem() {
  let k = (process.env.FCM_KEY || '').replace(/\\n/g, '\n').trim();
  if (!k) return null;
  if (!k.includes('BEGIN')) {
    const corpo = k.replace(/\s+/g, '').match(/.{1,64}/g).join('\n');
    k = `-----BEGIN PRIVATE KEY-----\n${corpo}\n-----END PRIVATE KEY-----\n`;
  }
  return k;
}

export const fcmConfigurado = () => !!(process.env.FCM_EMAIL && process.env.FCM_KEY && process.env.FCM_PROJECT);

async function accessToken() {
  if (cache.token && cache.exp > Date.now() + 60e3) return cache.token;
  const agora = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const base = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: process.env.FCM_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  })}`;
  const assinatura = crypto.createSign('RSA-SHA256').update(base).sign(chavePem()).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${base}.${assinatura}` }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('FCM token: ' + JSON.stringify(d));
  cache = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return cache.token;
}

export async function enviarPush(tokens, { titulo, corpo, dados = {} }) {
  const lista = [...new Set(tokens)].filter(Boolean);
  if (!lista.length || !fcmConfigurado()) return { dispositivos: lista.length, entregues: 0 };
  const at = await accessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT}/messages:send`;
  let entregues = 0;
  const invalidos = [];
  const strDados = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, String(v)]));
  for (let i = 0; i < lista.length; i += 20) {
    await Promise.all(
      lista.slice(i, i + 20).map(async (token) => {
        const r = await fetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: titulo, body: corpo },
              data: strDados,
              android: { priority: 'high', notification: { channel_id: 'avisos', color: '#1F4E8C' } },
            },
          }),
        });
        if (r.ok) entregues++;
        else {
          const t = await r.text();
          if (r.status === 404 || t.includes('UNREGISTERED') || t.includes('INVALID_ARGUMENT')) invalidos.push(token);
          else console.error('FCM', r.status, t);
        }
      }),
    );
  }
  if (invalidos.length) await q('DELETE FROM dispositivos WHERE token = ANY($1)', [invalidos]);
  return { dispositivos: lista.length, entregues };
}

export async function tokensDestino({ paraTodos, grupos = [], usuarios = [] }) {
  const linhas = await q(
    `SELECT DISTINCT d.token FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id
      WHERE u.status = 'ativo' AND u.papel = 'jovem' AND (
        $1::boolean
        OR u.id = ANY($3::int[])
        OR EXISTS (SELECT 1 FROM grupo_membros gm WHERE gm.usuario_id = u.id AND gm.grupo_id = ANY($2::int[])))`,
    [!!paraTodos, grupos, usuarios],
  );
  return linhas.map((l) => l.token);
}

export async function notificar({ titulo, corpo, paraTodos = false, grupos = [], usuarios = [], atividadeId = null, autor = null, dados = {} }) {
  const tokens = await tokensDestino({ paraTodos, grupos, usuarios });
  let res = { dispositivos: tokens.length, entregues: 0 };
  try {
    res = await enviarPush(tokens, { titulo, corpo, dados: { ...dados, ...(atividadeId ? { atividade: atividadeId } : {}) } });
  } catch (e) {
    console.error('push', e);
  }
  await q(
    `INSERT INTO notificacoes (titulo, corpo, para_todos, grupos, usuarios, atividade_id, enviada_por, dispositivos, entregues)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [titulo, corpo, !!paraTodos, grupos, usuarios, atividadeId, autor?.id || null, res.dispositivos, res.entregues],
  );
  return res;
}
