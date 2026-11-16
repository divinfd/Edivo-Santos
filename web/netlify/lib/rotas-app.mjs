import { getStore } from '@netlify/blobs';
import { q, q1, falha, json, binario, autenticar, texto, configCompleta, SECOES, CATEGORIAS } from './core.mjs';
import { mensagensComFrase } from './frases.mjs';
import { SQL_ATIVIDADE_VISIVEL_JOVEM, exigeAtividadeVisivelJovem } from './escopo.mjs';
import { obterLiturgia, dataValida, hojeBrasil } from './liturgia.mjs';
import { notificar } from './fcm.mjs';

const CAMPOS_ATIVIDADE = `a.id, a.titulo, a.descricao, a.categoria, a.capa_key, a.prazo, a.publicar_em, a.permitir_download, a.permitir_offline, a.status,
  f.id AS arquivo_id, f.nome AS arquivo_nome, f.tamanho AS arquivo_tamanho, f.partes AS arquivo_partes,
  p.status AS progresso, p.iniciada_em, p.concluida_em, r.id AS resposta_id, r.enviada_em,
  (SELECT count(*)::int FROM perguntas pq WHERE pq.atividade_id = a.id) AS total_perguntas`;

const JOIN_ATIVIDADE = `FROM atividades a
  LEFT JOIN arquivos f ON f.id = a.arquivo_id AND f.completo
  LEFT JOIN progresso p ON p.atividade_id = a.id AND p.usuario_id = $1
  LEFT JOIN respostas r ON r.atividade_id = a.id AND r.usuario_id = $1`;

export default function (r) {
  r('GET', '/app/inicio', async ({ req }) => {
    const u = await autenticar(req);
    const c = await configCompleta();
    const novas = await q1(
      `SELECT count(*)::int AS n FROM atividades a WHERE a.status = 'publicada' AND ${SQL_ATIVIDADE_VISIVEL_JOVEM}
         AND NOT EXISTS (SELECT 1 FROM progresso p WHERE p.atividade_id = a.id AND p.usuario_id = $1)
         AND NOT EXISTS (SELECT 1 FROM respostas rr WHERE rr.atividade_id = a.id AND rr.usuario_id = $1)`,
      [u.id],
    );
    return json({ nome_app: c.nome_app, nome: u.nome, ...(await mensagensComFrase(c)), novas_atividades: novas.n });
  });

  r('GET', '/app/categorias', async () => json(CATEGORIAS));

  r('GET', '/app/atividades', async ({ req }) => {
    const u = await autenticar(req);
    const lista = await q(`SELECT ${CAMPOS_ATIVIDADE} ${JOIN_ATIVIDADE} WHERE ${SQL_ATIVIDADE_VISIVEL_JOVEM} ORDER BY a.publicar_em DESC`, [u.id]);
    return json(lista);
  });

  r('GET', '/app/atividades/:id', async ({ req, params }) => {
    const u = await autenticar(req);
    await exigeAtividadeVisivelJovem(u, params.id);
    const a = await q1(`SELECT ${CAMPOS_ATIVIDADE} ${JOIN_ATIVIDADE} WHERE a.id = $2`, [u.id, params.id]);
    a.perguntas = await q('SELECT id, ordem, texto, tipo, opcoes, obrigatoria FROM perguntas WHERE atividade_id = $1 ORDER BY ordem, id', [a.id]);
    if (a.resposta_id) {
      const resp = await q1('SELECT id, enviada_em, comentario FROM respostas WHERE id = $1', [a.resposta_id]);
      resp.itens = await q('SELECT pergunta_id, valor FROM resposta_itens WHERE resposta_id = $1', [a.resposta_id]);
      a.resposta = resp;
    }
    return json(a);
  });

  r('POST', '/app/atividades/:id/progresso', async ({ req, params, body }) => {
    const u = await autenticar(req);
    await exigeAtividadeVisivelJovem(u, params.id);
    const status = body.status === 'concluida' ? 'concluida' : 'iniciada';
    if (status === 'iniciada') {
      await q(
        `INSERT INTO progresso (usuario_id, atividade_id, status, iniciada_em) VALUES ($1,$2,'iniciada', now())
         ON CONFLICT (usuario_id, atividade_id) DO NOTHING`,
        [u.id, params.id],
      );
    } else {
      await q(
        `INSERT INTO progresso (usuario_id, atividade_id, status, iniciada_em, concluida_em) VALUES ($1,$2,'concluida', now(), now())
         ON CONFLICT (usuario_id, atividade_id) DO UPDATE SET status = 'concluida', concluida_em = COALESCE(progresso.concluida_em, now())`,
        [u.id, params.id],
      );
    }
    return json({ ok: true, status });
  });

  r('GET', '/app/arquivos/:id/partes/:n', async ({ req, params }) => {
    const u = await autenticar(req);
    const ok = await q1(`SELECT a.id FROM atividades a WHERE a.arquivo_id = $2 AND ${SQL_ATIVIDADE_VISIVEL_JOVEM} LIMIT 1`, [u.id, params.id]);
    if (!ok) falha(404, 'Arquivo não encontrado.');
    const buf = await getStore({ name: 'pdfs', consistency: 'strong' }).get(`${params.id}/${Number(params.n)}`, { type: 'arrayBuffer' });
    if (!buf) falha(404, 'Parte do arquivo não encontrada.');
    return binario(buf, 'application/octet-stream', { 'cache-control': 'private, no-store' });
  });

  r('POST', '/app/atividades/:id/resposta', async ({ req, params, body }) => {
    const u = await autenticar(req);
    const a = await exigeAtividadeVisivelJovem(u, params.id);
    const uuid = texto(body.client_uuid, 80) || null;
    if (uuid) {
      const ja = await q1('SELECT id, enviada_em FROM respostas WHERE client_uuid = $1 AND usuario_id = $2', [uuid, u.id]);
      if (ja) return json({ ok: true, id: ja.id, enviada_em: ja.enviada_em, repetida: true });
    }
    const existente = await q1('SELECT id FROM respostas WHERE usuario_id = $1 AND atividade_id = $2', [u.id, a.id]);
    if (existente) falha(409, 'Você já enviou sua resposta para esta atividade.');
    const perguntas = await q('SELECT * FROM perguntas WHERE atividade_id = $1', [a.id]);
    const itens = new Map((Array.isArray(body.itens) ? body.itens : []).map((i) => [Number(i.pergunta_id), texto(i.valor, 8000)]));
    for (const p of perguntas) {
      const v = itens.get(p.id) || '';
      if (p.obrigatoria && !v) falha(400, `Responda: "${p.texto}"`);
      if (v && p.tipo === 'multipla' && !(p.opcoes || []).includes(v)) falha(400, `Opção inválida em "${p.texto}"`);
      if (v && p.tipo === 'escala') {
        const [min, max] = Array.isArray(p.opcoes) && p.opcoes.length === 2 ? p.opcoes.map(Number) : [1, 5];
        const n = Number(v);
        if (!Number.isInteger(n) || n < min || n > max) falha(400, `Valor inválido em "${p.texto}"`);
      }
    }
    const respondidas = perguntas.filter((p) => itens.get(p.id));
    const resp = await q1(
      `WITH r AS (INSERT INTO respostas (usuario_id, atividade_id, client_uuid, comentario) VALUES ($1,$2,$3,$4) RETURNING id, enviada_em),
            i AS (INSERT INTO resposta_itens (resposta_id, pergunta_id, valor) SELECT r.id, x.p, x.v FROM r, unnest($5::int[], $6::text[]) AS x(p, v))
       SELECT id, enviada_em FROM r`,
      [u.id, a.id, uuid, texto(body.comentario, 8000) || null, respondidas.map((p) => p.id), respondidas.map((p) => itens.get(p.id))],
    );
    await q(
      `INSERT INTO progresso (usuario_id, atividade_id, status, iniciada_em, concluida_em) VALUES ($1,$2,'concluida', now(), now())
       ON CONFLICT (usuario_id, atividade_id) DO UPDATE SET status = 'concluida', concluida_em = COALESCE(progresso.concluida_em, now())`,
      [u.id, a.id],
    );
    await notificar({
      titulo: 'Sua atividade foi recebida', corpo: `Obrigado por partilhar sua oração "${a.titulo}". Seguimos caminhando juntos!`,
      tituloEs: 'Tu actividad fue recibida', corpoEs: `Gracias por compartir tu oración "${a.titulo}". ¡Seguimos caminando juntos!`, usuarios: [u.id], dados: { tipo: 'recebida' } });
    return json({ ok: true, id: resp.id, enviada_em: resp.enviada_em }, 201);
  });

  r('GET', '/app/respostas', async ({ req }) => {
    const u = await autenticar(req);
    const lista = await q(
      `SELECT r.id, r.enviada_em, r.comentario, a.id AS atividade_id, a.titulo, a.categoria
         FROM respostas r JOIN atividades a ON a.id = r.atividade_id WHERE r.usuario_id = $1 ORDER BY r.enviada_em DESC`,
      [u.id],
    );
    const itens = await q(
      `SELECT ri.resposta_id, p.texto AS pergunta, p.tipo, ri.valor FROM resposta_itens ri
         JOIN perguntas p ON p.id = ri.pergunta_id JOIN respostas r ON r.id = ri.resposta_id
        WHERE r.usuario_id = $1 ORDER BY p.ordem, p.id`,
      [u.id],
    );
    for (const l of lista) l.itens = itens.filter((i) => i.resposta_id === l.id);
    return json(lista);
  });

  r('GET', '/app/liturgia', async ({ req, url }) => {
    await autenticar(req);
    const iso = dataValida(url.searchParams.get('data')) || hojeBrasil();
    const l = await obterLiturgia(iso);
    if (!l) falha(503, 'Não foi possível carregar a liturgia deste dia. Tente novamente mais tarde.');
    return json(l);
  });

  r('GET', '/app/familia', async ({ req }) => {
    await autenticar(req);
    const linhas = await q('SELECT id, secao, titulo, texto, imagem_key, video_url, ordem FROM conteudos WHERE publicado ORDER BY ordem, id');
    return json(Object.entries(SECOES).map(([chave, nome]) => ({ chave, nome, itens: linhas.filter((l) => l.secao === chave) })));
  });

  r('GET', '/app/contato', async ({ req }) => {
    await autenticar(req);
    return json((await configCompleta()).contato);
  });

  r('GET', '/app/mensagens', async ({ req }) => {
    const u = await autenticar(req);
    return json(await q('SELECT id, tipo, texto, criado_em, resposta, respondida_em FROM mensagens WHERE usuario_id = $1 ORDER BY criado_em DESC', [u.id]));
  });

  r('POST', '/app/mensagens', async ({ req, body }) => {
    const u = await autenticar(req);
    const tipo = ['duvida', 'orientacao', 'encontros', 'mensagem'].includes(body.tipo) ? body.tipo : 'mensagem';
    const t = texto(body.texto, 4000);
    if (t.length < 2) falha(400, 'Escreva sua mensagem.');
    const uuid = texto(body.client_uuid, 80) || null;
    if (uuid) {
      const ja = await q1('SELECT id, tipo, texto, criado_em FROM mensagens WHERE usuario_id = $1 AND client_uuid = $2', [u.id, uuid]);
      if (ja) return json(ja);
    }
    const m = await q1('INSERT INTO mensagens (usuario_id, tipo, texto, client_uuid) VALUES ($1,$2,$3,$4) RETURNING id, tipo, texto, criado_em', [u.id, tipo, t, uuid]);
    return json(m, 201);
  });

  r('GET', '/app/avisos', async ({ req }) => {
    const u = await autenticar(req);
    return json(
      await q(
        `SELECT n.id, n.titulo, n.corpo, n.atividade_id, n.criada_em FROM notificacoes n
          WHERE n.criada_em > now() - interval '60 days' AND (n.para_todos OR $1 = ANY(n.usuarios)
             OR EXISTS (SELECT 1 FROM grupo_membros gm WHERE gm.usuario_id = $1 AND gm.grupo_id = ANY(n.grupos)))
          ORDER BY n.criada_em DESC LIMIT 50`,
        [u.id],
      ),
    );
  });

  r('POST', '/app/dispositivo', async ({ req, body }) => {
    const u = await autenticar(req);
    const token = texto(body.token, 500);
    if (!token) falha(400, 'token ausente');
    const idioma = body.idioma === 'pt' ? 'pt' : 'es';
    await q(
      'INSERT INTO dispositivos (token, usuario_id, idioma) VALUES ($1,$2,$3) ON CONFLICT (token) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, idioma = EXCLUDED.idioma, atualizado_em = now()',
      [token, u.id, idioma],
    );
    return json({ ok: true });
  });
}
