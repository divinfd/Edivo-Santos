import { json, HttpError, corsHeaders } from '../lib/core.mjs';
import rotasAuth from '../lib/rotas-auth.mjs';
import rotasApp from '../lib/rotas-app.mjs';
import rotasPainel from '../lib/rotas-painel.mjs';
import rotasEncontros from '../lib/encontros.mjs';
import { getStore } from '@netlify/blobs';

const rotas = [];
function r(metodo, caminho, fn) {
  const nomes = [];
  const re = new RegExp('^' + caminho.replace(/:(\w+)/g, (_, n) => (nomes.push(n), '([^/]+)')) + '/?$');
  rotas.push({ metodo, re, nomes, fn });
}
rotasAuth(r);
rotasApp(r);
rotasPainel(r);
rotasEncontros(r);

r('GET', '/imagens/:key', async ({ params }) => {
  const res = await getStore({ name: 'imagens' }).getWithMetadata(params.key, { type: 'arrayBuffer' });
  if (!res) return new Response('não encontrada', { status: 404 });
  return new Response(res.data, { headers: { 'content-type': res.metadata?.tipo || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', ...corsHeaders } });
});

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const caminho = url.pathname.replace(/^\/api/, '') || '/';
  try {
    for (const rota of rotas) {
      if (rota.metodo !== req.method) continue;
      const m = caminho.match(rota.re);
      if (!m) continue;
      const params = Object.fromEntries(rota.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      const ct = req.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await req.json().catch(() => ({})) : {};
      return await rota.fn({ req, url, params, body, ip: context?.ip || req.headers.get('x-nf-client-connection-ip') || '' });
    }
    return json({ erro: 'Rota não encontrada.' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ erro: e.message }, e.status);
    console.error(e);
    return json({ erro: 'Erro interno. Tente novamente em instantes.' }, 500);
  }
};

export const config = { path: '/api/*' };
