import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import {
  q, q1, falha, json, binario, autenticar, auditar, texto, emailValido, hashSenha, validarSenha, senhaTemporaria,
  configCompleta, setConfig, CATEGORIAS, SECOES, CONFIG_PADRAO,
} from './core.mjs';
import { jovensVisiveis, gruposVisiveis, exigeJovemVisivel, exigeAtividadePainel, SQL_JOVEM_ELEGIVEL } from './escopo.mjs';
import { notificar, fcmConfigurado } from './fcm.mjs';
import { obterLiturgia, buscarFonte, dataValida, hojeBrasil, tempoLiturgico } from './liturgia.mjs';
import { emailConfigurado } from './email.mjs';

export const TAMANHO_PARTE = 3 * 1024 * 1024;
const MAX_PDF = 40 * 1024 * 1024;

async function equipe(req) {
  const u = await autenticar(req);
  if (u.papel !== 'admin' && u.papel !== 'responsavel') falha(403, 'Acesso restrito aos responsáveis vocacionais.');
  return u;
}
async function admin(req) {
  const u = await equipe(req);
  if (u.papel !== 'admin') falha(403, 'Somente administradores podem fazer isso.');
  return u;
}
const ids = (v) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : []);
const bool = (v) => v === true || v === 'true' || v === 1;

async function pdfs() {
  return getStore({ name: 'pdfs', consistency: 'strong' });
}

async function lerAtividadeCompleta(id) {
  const a = await q1(
    `SELECT a.*, f.nome AS arquivo_nome, f.tamanho AS arquivo_tamanho, f.partes AS arquivo_partes, f.completo AS arquivo_completo,
            u.nome AS criado_por_nome
       FROM atividades a LEFT JOIN arquivos f ON f.id = a.arquivo_id LEFT JOIN usuarios u ON u.id = a.criado_por WHERE a.id = $1`,
    [id],
  );
  a.grupos = (await q('SELECT grupo_id FROM atividade_grupos WHERE atividade_id = $1', [id])).map((g) => g.grupo_id);
  a.perguntas = await q('SELECT id, ordem, texto, tipo, opcoes, obrigatoria, (SELECT count(*)::int FROM resposta_itens ri WHERE ri.pergunta_id = p.id) AS respostas FROM perguntas p WHERE atividade_id = $1 ORDER BY ordem, id', [id]);
  return a;
}

function validarPergunta(p, i) {
  const t = texto(p.texto, 1000);
  if (!t) falha(400, `A pergunta ${i + 1} está sem texto.`);
  const tipo = ['texto_longo', 'texto_curto', 'multipla', 'escala'].includes(p.tipo) ? p.tipo : 'texto_longo';
  let opcoes = [];
  if (tipo === 'multipla') {
    opcoes = (Array.isArray(p.opcoes) ? p.opcoes : []).map((o) => texto(o, 300)).filter(Boolean);
    if (opcoes.length < 2) falha(400, `A pergunta "${t}" precisa de pelo menos 2 opções.`);
  }
  if (tipo === 'escala') {
    const [a, b] = Array.isArray(p.opcoes) && p.opcoes.length === 2 ? p.opcoes.map(Number) : [1, 5];
    opcoes = Number.isInteger(a) && Number.isInteger(b) && a < b && b - a <= 10 ? [a, b] : [1, 5];
  }
  return { id: Number(p.id) || null, texto: t, tipo, opcoes, obrigatoria: p.obrigatoria !== false, ordem: i };
}

async function exigeArquivo(u, id, escrita) {
  const f = await q1('SELECT * FROM arquivos WHERE id = $1', [Number(id) || 0]);
  if (!f) falha(404, 'Arquivo não encontrado.');
  if (u.papel === 'admin' || f.criado_por === u.id) return f;
  if (!escrita) {
    const ok = await q1(
      `SELECT 1 FROM atividades a WHERE a.arquivo_id = $1 AND (a.criado_por = $2 OR EXISTS (
         SELECT 1 FROM atividade_grupos ag WHERE ag.atividade_id = a.id AND ag.grupo_id = ANY($3::int[]))) LIMIT 1`,
      [f.id, u.id, await gruposVisiveis(u)],
    );
    if (ok) return f;
  }
  falha(404, 'Arquivo não encontrado.');
}

async function salvarAtividade(u, body, id = null) {
  const titulo = texto(body.titulo, 200);
  if (!titulo) falha(400, 'Informe o título.');
  const categoria = CATEGORIAS.includes(body.categoria) ? body.categoria : CATEGORIAS[0];
  let paraTodos = bool(body.para_todos);
  let grupos = ids(body.grupos);
  if (u.papel !== 'admin') {
    const meus = await gruposVisiveis(u);
    paraTodos = false;
    grupos = grupos.filter((g) => meus.includes(g));
    if (!grupos.length) falha(400, 'Escolha pelo menos um dos seus grupos.');
  } else if (!paraTodos && !grupos.length) falha(400, 'Escolha "Todos os jovens" ou pelo menos um grupo.');
  const publicarEm = body.publicar_em ? new Date(body.publicar_em) : new Date();
  if (isNaN(publicarEm)) falha(400, 'Data de publicação inválida.');
  const prazo = /^\d{4}-\d{2}-\d{2}$/.test(body.prazo || '') ? body.prazo : null;
  const arquivoId = Number(body.arquivo_id) || null;
  if (arquivoId && !(await exigeArquivo(u, arquivoId, false)).completo) falha(400, 'O PDF ainda não terminou de ser enviado.');
  const perguntas = (Array.isArray(body.perguntas) ? body.perguntas : []).map(validarPergunta);
  const atuais = id ? await q('SELECT p.id, (SELECT count(*)::int FROM resposta_itens ri WHERE ri.pergunta_id = p.id) AS n FROM perguntas p WHERE atividade_id = $1', [id]) : [];
  const manter = new Set(perguntas.filter((p) => p.id).map((p) => p.id));
  if (atuais.some((a) => !manter.has(a.id) && a.n > 0)) falha(400, 'Não é possível remover uma pergunta que já recebeu respostas.');
  const vals = [titulo, texto(body.descricao, 5000), categoria, texto(body.capa_key, 200) || null, arquivoId, publicarEm, prazo,
    bool(body.permitir_download), body.permitir_offline !== false, paraTodos];
  if (id) {
    await q(
      `UPDATE atividades SET titulo=$1, descricao=$2, categoria=$3, capa_key=$4, arquivo_id=$5, publicar_em=$6, prazo=$7,
         permitir_download=$8, permitir_offline=$9, para_todos=$10, atualizado_em=now() WHERE id=$11`,
      [...vals, id],
    );
  } else {
    id = (await q1(
      `INSERT INTO atividades (titulo, descricao, categoria, capa_key, arquivo_id, publicar_em, prazo, permitir_download, permitir_offline, para_todos, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [...vals, u.id],
    )).id;
  }
  await q('DELETE FROM atividade_grupos WHERE atividade_id = $1', [id]);
  for (const g of grupos) await q('INSERT INTO atividade_grupos (atividade_id, grupo_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, g]);
  for (const a of atuais) if (!manter.has(a.id)) await q('DELETE FROM perguntas WHERE id = $1', [a.id]);
  const idsAtuais = new Set(atuais.map((a) => a.id));
  for (const p of perguntas) {
    if (p.id && idsAtuais.has(p.id)) {
      await q('UPDATE perguntas SET texto=$1, tipo=$2, opcoes=$3, obrigatoria=$4, ordem=$5 WHERE id=$6', [p.texto, p.tipo, JSON.stringify(p.opcoes), p.obrigatoria, p.ordem, p.id]);
    } else {
      await q('INSERT INTO perguntas (atividade_id, texto, tipo, opcoes, obrigatoria, ordem) VALUES ($1,$2,$3,$4,$5,$6)', [id, p.texto, p.tipo, JSON.stringify(p.opcoes), p.obrigatoria, p.ordem]);
    }
  }
  return id;
}

async function enviarAvisoAtividade(u, a) {
  const grupos = (await q('SELECT grupo_id FROM atividade_grupos WHERE atividade_id = $1', [a.id])).map((g) => g.grupo_id);
  const res = await notificar({
    titulo: 'Uma nova oração foi publicada',
    corpo: a.titulo,
    paraTodos: a.para_todos,
    grupos,
    atividadeId: a.id,
    autor: u,
    dados: { tipo: 'atividade' },
  });
  await q('UPDATE atividades SET notificado_em = now(), notificar = false WHERE id = $1', [a.id]);
  return res;
}
export { enviarAvisoAtividade };

export default function (r) {
  r('GET', '/painel/status', async ({ req }) => {
    await equipe(req);
    return json({ push: fcmConfigurado(), email: emailConfigurado(), categorias: CATEGORIAS, secoes: SECOES, tamanho_parte: TAMANHO_PARTE, max_pdf: MAX_PDF });
  });

  // ---------- DASHBOARD ----------
  r('GET', '/painel/dashboard', async ({ req, url }) => {
    const u = await equipe(req);
    const dias = Math.min(Math.max(Number(url.searchParams.get('dias')) || 30, 7), 365);
    const v = await jovensVisiveis(u);
    const P = [v, dias];
    const filtroJ = '($1::int[] IS NULL OR u.id = ANY($1::int[]))';
    const ind = await q1(
      `SELECT
        (SELECT count(*)::int FROM usuarios u WHERE u.papel='jovem' AND ${filtroJ}) AS total_jovens,
        (SELECT count(*)::int FROM usuarios u WHERE u.papel='jovem' AND u.status='ativo' AND u.ultimo_acesso > now() - interval '30 days' AND ${filtroJ}) AS ativos,
        (SELECT count(*)::int FROM usuarios u WHERE u.papel='jovem' AND u.criado_em > now() - make_interval(days => $2) AND ${filtroJ}) AS novos,
        (SELECT count(*)::int FROM usuarios u WHERE u.papel='jovem' AND u.status='pendente' AND ${filtroJ}) AS aguardando_aprovacao,
        (SELECT count(*)::int FROM atividades WHERE status='publicada') AS publicadas,
        (SELECT count(*)::int FROM progresso p JOIN usuarios u ON u.id=p.usuario_id WHERE p.status='concluida' AND ${filtroJ}) AS concluidas,
        (SELECT count(*)::int FROM respostas r JOIN usuarios u ON u.id=r.usuario_id WHERE ${filtroJ}) AS respostas,
        (SELECT count(*)::int FROM respostas r JOIN usuarios u ON u.id=r.usuario_id WHERE r.lida_em IS NULL AND ${filtroJ}) AS respostas_nao_lidas,
        (SELECT count(*)::int FROM atividades a JOIN usuarios u ON u.papel='jovem' AND u.status='ativo' AND ${filtroJ}
           WHERE a.status='publicada' AND a.publicar_em <= now() AND EXISTS (SELECT 1 FROM perguntas pq WHERE pq.atividade_id=a.id) AND ${SQL_JOVEM_ELEGIVEL}
             AND NOT EXISTS (SELECT 1 FROM respostas r WHERE r.atividade_id=a.id AND r.usuario_id=u.id)) AS pendentes,
        (SELECT count(*)::int FROM mensagens m JOIN usuarios u ON u.id=m.usuario_id WHERE m.resposta IS NULL AND ${filtroJ}) AS mensagens_abertas`,
      P,
    );
    const serie = await q(
      `WITH d AS (SELECT generate_series((now() AT TIME ZONE 'America/Sao_Paulo')::date - ($2 - 1), (now() AT TIME ZONE 'America/Sao_Paulo')::date, '1 day')::date AS dia)
       SELECT to_char(d.dia,'YYYY-MM-DD') AS dia,
         (SELECT count(*)::int FROM respostas r JOIN usuarios u ON u.id=r.usuario_id WHERE (r.enviada_em AT TIME ZONE 'America/Sao_Paulo')::date = d.dia AND ${filtroJ}) AS respostas,
         (SELECT count(*)::int FROM progresso p JOIN usuarios u ON u.id=p.usuario_id WHERE p.status='concluida' AND (p.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date = d.dia AND ${filtroJ}) AS concluidas,
         (SELECT count(*)::int FROM usuarios u WHERE u.papel='jovem' AND (u.criado_em AT TIME ZONE 'America/Sao_Paulo')::date = d.dia AND ${filtroJ}) AS cadastros
       FROM d ORDER BY d.dia`,
      P,
    );
    const ultimas = await q(
      `SELECT r.id, r.enviada_em, r.lida_em, u.id AS jovem_id, u.nome AS jovem, a.titulo AS atividade
         FROM respostas r JOIN usuarios u ON u.id=r.usuario_id JOIN atividades a ON a.id=r.atividade_id
        WHERE ${filtroJ} ORDER BY r.enviada_em DESC LIMIT 10`,
      [v],
    );
    return json({ indicadores: ind, serie, ultimas });
  });

  // ---------- JOVENS ----------
  r('GET', '/painel/jovens', async ({ req, url }) => {
    const u = await equipe(req);
    const v = await jovensVisiveis(u);
    const busca = `%${texto(url.searchParams.get('busca'), 100).toLowerCase()}%`;
    const grupo = Number(url.searchParams.get('grupo')) || null;
    const status = url.searchParams.get('status') || null;
    return json(
      await q(
        `SELECT u.id, u.nome, u.email, u.telefone, to_char(u.data_nascimento,'YYYY-MM-DD') AS data_nascimento, u.status, u.criado_em, u.ultimo_acesso,
                u.responsavel_legal_nome, u.consentimento_declarado_em, u.consentimento_confirmado_em, u.exclusao_solicitada_em,
                COALESCE((SELECT json_agg(json_build_object('id', g.id, 'nome', g.nome)) FROM grupo_membros gm JOIN grupos g ON g.id = gm.grupo_id WHERE gm.usuario_id = u.id), '[]') AS grupos,
                (SELECT count(*)::int FROM respostas r WHERE r.usuario_id = u.id) AS respostas
           FROM usuarios u
          WHERE u.papel = 'jovem' AND ($1::int[] IS NULL OR u.id = ANY($1::int[]))
            AND (lower(u.nome) LIKE $2 OR lower(u.email) LIKE $2)
            AND ($3::int IS NULL OR EXISTS (SELECT 1 FROM grupo_membros gm WHERE gm.usuario_id = u.id AND gm.grupo_id = $3))
            AND ($4::text IS NULL OR u.status = $4)
          ORDER BY (u.status = 'pendente') DESC, u.nome`,
        [v, busca, grupo, status],
      ),
    );
  });

  r('POST', '/painel/jovens', async ({ req, body, ip }) => {
    const u = await equipe(req);
    const nome = texto(body.nome, 120);
    if (nome.length < 3) falha(400, 'Informe o nome completo.');
    const email = emailValido(body.email);
    if (await q1('SELECT id FROM usuarios WHERE email = $1', [email])) falha(409, 'Já existe uma conta com este e-mail.');
    const nasc = /^\d{4}-\d{2}-\d{2}$/.test(body.data_nascimento || '') ? body.data_nascimento : null;
    let grupos = ids(body.grupos);
    if (u.papel !== 'admin') {
      const meus = await gruposVisiveis(u);
      grupos = grupos.filter((g) => meus.includes(g));
      if (!grupos.length) falha(400, 'Escolha pelo menos um dos seus grupos para o jovem.');
    }
    const senha = body.senha ? validarSenha(body.senha) : senhaTemporaria();
    const novo = await q1(
      `INSERT INTO usuarios (nome, email, senha_hash, papel, status, data_nascimento, telefone, responsavel_legal_nome, responsavel_legal_contato, consentimento_confirmado_em, consentimento_confirmado_por)
       VALUES ($1,$2,$3,'jovem','ativo',$4,$5,$6,$7,$8,$9) RETURNING id`,
      [nome, email, hashSenha(senha), nasc, texto(body.telefone, 30) || null, texto(body.responsavel_legal_nome, 120) || null,
        texto(body.responsavel_legal_contato, 120) || null, bool(body.consentimento_confirmado) ? new Date() : null, bool(body.consentimento_confirmado) ? u.id : null],
    );
    for (const g of grupos) await q('INSERT INTO grupo_membros (grupo_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g, novo.id]);
    await auditar(u, 'jovem_cadastrado', { jovem: novo.id }, ip);
    return json({ id: novo.id, senha_inicial: senha }, 201);
  });

  r('GET', '/painel/jovens/:id', async ({ req, params, ip }) => {
    const u = await equipe(req);
    await exigeJovemVisivel(u, params.id);
    const j = await q1(
      `SELECT id, nome, email, telefone, to_char(data_nascimento,'YYYY-MM-DD') AS data_nascimento, status, criado_em, ultimo_acesso,
              responsavel_legal_nome, responsavel_legal_contato, consentimento_declarado_em, consentimento_confirmado_em, exclusao_solicitada_em
         FROM usuarios WHERE id = $1`,
      [params.id],
    );
    j.grupos = await q('SELECT g.id, g.nome FROM grupo_membros gm JOIN grupos g ON g.id = gm.grupo_id WHERE gm.usuario_id = $1', [params.id]);
    j.atividades = await q(
      `SELECT a.id, a.titulo, a.categoria, a.publicar_em, a.prazo, p.status AS progresso, p.iniciada_em, p.concluida_em, r.id AS resposta_id, r.enviada_em
         FROM atividades a JOIN usuarios u ON u.id = $1
         LEFT JOIN progresso p ON p.atividade_id = a.id AND p.usuario_id = u.id
         LEFT JOIN respostas r ON r.atividade_id = a.id AND r.usuario_id = u.id
        WHERE a.status <> 'rascunho' AND a.publicar_em <= now() AND ${SQL_JOVEM_ELEGIVEL}
        ORDER BY a.publicar_em DESC`,
      [params.id],
    );
    j.observacoes = await q(
      'SELECT o.id, o.texto, o.criado_em, o.resposta_id, us.nome AS autor FROM observacoes o LEFT JOIN usuarios us ON us.id = o.autor_id WHERE o.jovem_id = $1 ORDER BY o.criado_em DESC',
      [params.id],
    );
    j.mensagens = await q('SELECT id, tipo, texto, criado_em, resposta, respondida_em FROM mensagens WHERE usuario_id = $1 ORDER BY criado_em DESC', [params.id]);
    await auditar(u, 'jovem_consultado', { jovem: Number(params.id) }, ip);
    return json(j);
  });

  r('PUT', '/painel/jovens/:id', async ({ req, params, body, ip }) => {
    const u = await equipe(req);
    await exigeJovemVisivel(u, params.id);
    const nome = texto(body.nome, 120);
    if (nome.length < 3) falha(400, 'Informe o nome completo.');
    const email = emailValido(body.email);
    const outro = await q1('SELECT id FROM usuarios WHERE email = $1 AND id <> $2', [email, params.id]);
    if (outro) falha(409, 'Já existe outra conta com este e-mail.');
    const status = ['pendente', 'ativo', 'inativo'].includes(body.status) ? body.status : 'ativo';
    const nasc = /^\d{4}-\d{2}-\d{2}$/.test(body.data_nascimento || '') ? body.data_nascimento : null;
    await q(
      `UPDATE usuarios SET nome=$1, email=$2, telefone=$3, data_nascimento=$4, status=$5, responsavel_legal_nome=$6, responsavel_legal_contato=$7 WHERE id=$8`,
      [nome, email, texto(body.telefone, 30) || null, nasc, status, texto(body.responsavel_legal_nome, 120) || null, texto(body.responsavel_legal_contato, 120) || null, params.id],
    );
    if (status !== 'ativo') {
      await q('DELETE FROM sessoes WHERE usuario_id = $1', [params.id]);
    }
    if (Array.isArray(body.grupos)) {
      const novos = ids(body.grupos);
      const meus = await gruposVisiveis(u);
      const atuais = (await q('SELECT grupo_id FROM grupo_membros WHERE usuario_id = $1', [params.id])).map((g) => g.grupo_id);
      for (const g of atuais) if (!novos.includes(g) && (!meus || meus.includes(g))) await q('DELETE FROM grupo_membros WHERE grupo_id=$1 AND usuario_id=$2', [g, params.id]);
      for (const g of novos) if (!meus || meus.includes(g)) await q('INSERT INTO grupo_membros (grupo_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g, params.id]);
    }
    if (bool(body.consentimento_confirmado)) {
      await q('UPDATE usuarios SET consentimento_confirmado_em = COALESCE(consentimento_confirmado_em, now()), consentimento_confirmado_por = COALESCE(consentimento_confirmado_por, $2) WHERE id = $1', [params.id, u.id]);
    }
    await auditar(u, 'jovem_editado', { jovem: Number(params.id), status }, ip);
    return json({ ok: true });
  });

  r('POST', '/painel/jovens/:id/senha', async ({ req, params, ip }) => {
    const u = await equipe(req);
    await exigeJovemVisivel(u, params.id);
    const senha = senhaTemporaria();
    await q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hashSenha(senha), params.id]);
    await q('UPDATE recuperacao_senha SET usado = true WHERE usuario_id = $1', [params.id]);
    await q('DELETE FROM sessoes WHERE usuario_id = $1', [params.id]);
    await q('UPDATE recuperacao_senha SET atendido = true WHERE usuario_id = $1', [params.id]);
    await auditar(u, 'senha_jovem_redefinida', { jovem: Number(params.id) }, ip);
    return json({ senha_temporaria: senha });
  });

  r('DELETE', '/painel/jovens/:id', async ({ req, params, ip }) => {
    const u = await admin(req);
    await exigeJovemVisivel(u, params.id);
    const j = await q1('SELECT nome FROM usuarios WHERE id = $1', [params.id]);
    await q('DELETE FROM usuarios WHERE id = $1', [params.id]);
    await auditar(u, 'jovem_excluido', { jovem: Number(params.id), nome: j.nome }, ip);
    return json({ ok: true });
  });

  r('POST', '/painel/jovens/:id/observacoes', async ({ req, params, body, ip }) => {
    const u = await equipe(req);
    await exigeJovemVisivel(u, params.id);
    const t = texto(body.texto, 5000);
    if (!t) falha(400, 'Escreva a observação.');
    const respostaId = Number(body.resposta_id) || null;
    if (respostaId && !(await q1('SELECT 1 FROM respostas WHERE id = $1 AND usuario_id = $2', [respostaId, params.id]))) falha(404, 'Resposta não encontrada.');
    const o = await q1('INSERT INTO observacoes (jovem_id, autor_id, resposta_id, texto) VALUES ($1,$2,$3,$4) RETURNING id, texto, criado_em, resposta_id', [params.id, u.id, respostaId, t]);
    await auditar(u, 'observacao_registrada', { jovem: Number(params.id) }, ip);
    return json({ ...o, autor: u.nome }, 201);
  });

  r('DELETE', '/painel/observacoes/:id', async ({ req, params, ip }) => {
    const u = await equipe(req);
    const o = await q1('SELECT * FROM observacoes WHERE id = $1', [params.id]);
    if (!o) falha(404, 'Observação não encontrada.');
    if (u.papel !== 'admin' && o.autor_id !== u.id) falha(403, 'Somente o autor pode apagar esta observação.');
    await q('DELETE FROM observacoes WHERE id = $1', [params.id]);
    await auditar(u, 'observacao_apagada', { jovem: o.jovem_id }, ip);
    return json({ ok: true });
  });

  // ---------- EQUIPE (responsáveis e administradores) ----------
  r('GET', '/painel/equipe', async ({ req }) => {
    await admin(req);
    return json(
      await q(
        `SELECT u.id, u.nome, u.email, u.telefone, u.papel, u.status, u.ultimo_acesso, u.criado_em,
                COALESCE((SELECT json_agg(json_build_object('id', g.id, 'nome', g.nome)) FROM grupo_responsaveis gr JOIN grupos g ON g.id = gr.grupo_id WHERE gr.usuario_id = u.id), '[]') AS grupos
           FROM usuarios u WHERE u.papel IN ('admin','responsavel') ORDER BY u.nome`,
      ),
    );
  });

  r('POST', '/painel/equipe', async ({ req, body, ip }) => {
    const u = await admin(req);
    const nome = texto(body.nome, 120);
    if (nome.length < 3) falha(400, 'Informe o nome completo.');
    const email = emailValido(body.email);
    if (await q1('SELECT id FROM usuarios WHERE email = $1', [email])) falha(409, 'Já existe uma conta com este e-mail.');
    const papel = body.papel === 'admin' ? 'admin' : 'responsavel';
    const senha = senhaTemporaria();
    const novo = await q1("INSERT INTO usuarios (nome, email, senha_hash, papel, status, telefone) VALUES ($1,$2,$3,$4,'ativo',$5) RETURNING id", [nome, email, hashSenha(senha), papel, texto(body.telefone, 30) || null]);
    for (const g of ids(body.grupos)) await q('INSERT INTO grupo_responsaveis (grupo_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g, novo.id]);
    await auditar(u, 'equipe_cadastrada', { usuario: novo.id, papel }, ip);
    return json({ id: novo.id, senha_inicial: senha }, 201);
  });

  r('PUT', '/painel/equipe/:id', async ({ req, params, body, ip }) => {
    const u = await admin(req);
    const alvo = await q1("SELECT * FROM usuarios WHERE id = $1 AND papel IN ('admin','responsavel')", [params.id]);
    if (!alvo) falha(404, 'Usuário não encontrado.');
    const papel = body.papel === 'admin' ? 'admin' : 'responsavel';
    const status = body.status === 'inativo' ? 'inativo' : 'ativo';
    if (alvo.id === u.id && (papel !== 'admin' || status !== 'ativo')) falha(400, 'Você não pode remover seu próprio acesso de administrador.');
    const email = emailValido(body.email);
    if (await q1('SELECT id FROM usuarios WHERE email = $1 AND id <> $2', [email, params.id])) falha(409, 'Já existe outra conta com este e-mail.');
    await q('UPDATE usuarios SET nome=$1, email=$2, telefone=$3, papel=$4, status=$5 WHERE id=$6', [texto(body.nome, 120), email, texto(body.telefone, 30) || null, papel, status, params.id]);
    if (status !== 'ativo') await q('DELETE FROM sessoes WHERE usuario_id = $1', [params.id]);
    if (Array.isArray(body.grupos)) {
      await q('DELETE FROM grupo_responsaveis WHERE usuario_id = $1', [params.id]);
      for (const g of ids(body.grupos)) await q('INSERT INTO grupo_responsaveis (grupo_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g, params.id]);
    }
    await auditar(u, 'equipe_editada', { usuario: Number(params.id), papel, status }, ip);
    return json({ ok: true });
  });

  r('POST', '/painel/equipe/:id/senha', async ({ req, params, ip }) => {
    const u = await admin(req);
    const alvo = await q1("SELECT id FROM usuarios WHERE id = $1 AND papel IN ('admin','responsavel')", [params.id]);
    if (!alvo) falha(404, 'Usuário não encontrado.');
    const senha = senhaTemporaria();
    await q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hashSenha(senha), params.id]);
    await q('UPDATE recuperacao_senha SET usado = true WHERE usuario_id = $1', [params.id]);
    await q('DELETE FROM sessoes WHERE usuario_id = $1', [params.id]);
    await auditar(u, 'senha_equipe_redefinida', { usuario: Number(params.id) }, ip);
    return json({ senha_temporaria: senha });
  });

  // ---------- GRUPOS ----------
  r('GET', '/painel/grupos', async ({ req }) => {
    const u = await equipe(req);
    const g = await gruposVisiveis(u);
    return json(
      await q(
        `SELECT g.id, g.nome, g.descricao,
                COALESCE((SELECT json_agg(gm.usuario_id) FROM grupo_membros gm WHERE gm.grupo_id = g.id), '[]') AS membros,
                COALESCE((SELECT json_agg(json_build_object('id', us.id, 'nome', us.nome)) FROM grupo_responsaveis gr JOIN usuarios us ON us.id = gr.usuario_id WHERE gr.grupo_id = g.id), '[]') AS responsaveis
           FROM grupos g WHERE ($1::int[] IS NULL OR g.id = ANY($1::int[])) ORDER BY g.nome`,
        [g],
      ),
    );
  });

  r('POST', '/painel/grupos', async ({ req, body, ip }) => {
    const u = await admin(req);
    const nome = texto(body.nome, 120);
    if (!nome) falha(400, 'Informe o nome do grupo.');
    const g = await q1('INSERT INTO grupos (nome, descricao) VALUES ($1,$2) RETURNING id', [nome, texto(body.descricao, 1000)]);
    for (const m of ids(body.membros)) await q("INSERT INTO grupo_membros (grupo_id, usuario_id) SELECT $1, id FROM usuarios WHERE id = $2 AND papel = 'jovem' ON CONFLICT DO NOTHING", [g.id, m]);
    for (const m of ids(body.responsaveis)) await q("INSERT INTO grupo_responsaveis (grupo_id, usuario_id) SELECT $1, id FROM usuarios WHERE id = $2 AND papel IN ('admin','responsavel') ON CONFLICT DO NOTHING", [g.id, m]);
    await auditar(u, 'grupo_criado', { grupo: g.id }, ip);
    return json({ id: g.id }, 201);
  });

  r('PUT', '/painel/grupos/:id', async ({ req, params, body, ip }) => {
    const u = await equipe(req);
    const meus = await gruposVisiveis(u);
    if (meus && !meus.includes(Number(params.id))) falha(404, 'Grupo não encontrado.');
    if (u.papel === 'admin') {
      await q('UPDATE grupos SET nome = $1, descricao = $2 WHERE id = $3', [texto(body.nome, 120), texto(body.descricao, 1000), params.id]);
      if (Array.isArray(body.responsaveis)) {
        await q('DELETE FROM grupo_responsaveis WHERE grupo_id = $1', [params.id]);
        for (const m of ids(body.responsaveis)) await q("INSERT INTO grupo_responsaveis (grupo_id, usuario_id) SELECT $1, id FROM usuarios WHERE id = $2 AND papel IN ('admin','responsavel') ON CONFLICT DO NOTHING", [params.id, m]);
      }
    }
    if (Array.isArray(body.membros)) {
      const v = await jovensVisiveis(u);
      if (v) await q('DELETE FROM grupo_membros WHERE grupo_id = $1 AND usuario_id = ANY($2::int[])', [params.id, v]);
      else await q('DELETE FROM grupo_membros WHERE grupo_id = $1', [params.id]);
      for (const m of ids(body.membros).filter((m) => !v || v.includes(m))) await q("INSERT INTO grupo_membros (grupo_id, usuario_id) SELECT $1, id FROM usuarios WHERE id = $2 AND papel = 'jovem' ON CONFLICT DO NOTHING", [params.id, m]);
    }
    await auditar(u, 'grupo_editado', { grupo: Number(params.id) }, ip);
    return json({ ok: true });
  });

  r('DELETE', '/painel/grupos/:id', async ({ req, params, ip }) => {
    const u = await admin(req);
    await q('DELETE FROM grupos WHERE id = $1', [params.id]);
    await auditar(u, 'grupo_excluido', { grupo: Number(params.id) }, ip);
    return json({ ok: true });
  });

  // ---------- ARQUIVOS (PDF em partes) e IMAGENS ----------
  r('POST', '/painel/arquivos', async ({ req, body }) => {
    const u = await equipe(req);
    const tamanho = Number(body.tamanho);
    if (!Number.isInteger(tamanho) || tamanho <= 0) falha(400, 'Arquivo inválido.');
    if (tamanho > MAX_PDF) falha(400, 'O PDF pode ter no máximo 40 MB.');
    const nome = texto(body.nome, 200) || 'material.pdf';
    if (!/\.pdf$/i.test(nome)) falha(400, 'Envie um arquivo PDF.');
    const partes = Math.ceil(tamanho / TAMANHO_PARTE);
    const f = await q1('INSERT INTO arquivos (nome, tamanho, partes, criado_por) VALUES ($1,$2,$3,$4) RETURNING id, partes', [nome, tamanho, partes, u.id]);
    return json({ ...f, tamanho_parte: TAMANHO_PARTE }, 201);
  });

  r('PUT', '/painel/arquivos/:id/partes/:n', async ({ req, params }) => {
    const f = await exigeArquivo(await equipe(req), params.id, true);
    if (f.completo) falha(400, 'Este PDF já foi concluído. Para trocar, envie um novo arquivo.');
    const n = Number(params.n);
    if (!Number.isInteger(n) || n < 0 || n >= f.partes) falha(400, 'Parte inválida.');
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > TAMANHO_PARTE) falha(400, 'Parte com tamanho inválido.');
    if (n === 0 && !Buffer.from(buf.slice(0, 5)).toString('latin1').startsWith('%PDF')) falha(400, 'O arquivo enviado não é um PDF válido.');
    await (await pdfs()).set(`${f.id}/${n}`, buf);
    return json({ ok: true });
  });

  r('POST', '/painel/arquivos/:id/concluir', async ({ req, params }) => {
    const f = await exigeArquivo(await equipe(req), params.id, true);
    const { blobs } = await (await pdfs()).list({ prefix: `${f.id}/` });
    const tem = new Set(blobs.map((b) => b.key));
    for (let i = 0; i < f.partes; i++) if (!tem.has(`${f.id}/${i}`)) falha(400, `Falta a parte ${i + 1} do arquivo. Envie novamente.`);
    await q('UPDATE arquivos SET completo = true, partes_recebidas = partes WHERE id = $1', [f.id]);
    return json({ ok: true, id: f.id, nome: f.nome, tamanho: f.tamanho, partes: f.partes });
  });

  r('GET', '/painel/arquivos/:id/partes/:n', async ({ req, params }) => {
    const f = await exigeArquivo(await equipe(req), params.id, false);
    const buf = await (await pdfs()).get(`${f.id}/${Number(params.n)}`, { type: 'arrayBuffer' });
    if (!buf) falha(404, 'Parte não encontrada.');
    return binario(buf, 'application/octet-stream', { 'cache-control': 'private, no-store' });
  });

  r('POST', '/painel/imagens', async ({ req }) => {
    await equipe(req);
    const tipo = (req.headers.get('content-type') || '').split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(tipo)) falha(400, 'Envie uma imagem JPG, PNG ou WEBP.');
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 3 * 1024 * 1024) falha(400, 'A imagem pode ter no máximo 3 MB.');
    const key = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    await getStore({ name: 'imagens', consistency: 'strong' }).set(key, buf, { metadata: { tipo } });
    return json({ key }, 201);
  });

  // ---------- ATIVIDADES ----------
  r('GET', '/painel/atividades', async ({ req, url }) => {
    const u = await equipe(req);
    const g = await gruposVisiveis(u);
    const v = await jovensVisiveis(u);
    const status = url.searchParams.get('status') || null;
    return json(
      await q(
        `SELECT a.id, a.titulo, a.categoria, a.status, a.publicar_em, a.prazo, a.para_todos, a.capa_key, a.criado_em, a.notificado_em, a.criado_por,
                f.nome AS arquivo_nome,
                COALESCE((SELECT json_agg(gr.nome) FROM atividade_grupos ag JOIN grupos gr ON gr.id = ag.grupo_id WHERE ag.atividade_id = a.id), '[]') AS grupos,
                (SELECT count(*)::int FROM perguntas p WHERE p.atividade_id = a.id) AS perguntas,
                (SELECT count(*)::int FROM respostas r WHERE r.atividade_id = a.id AND ($2::int[] IS NULL OR r.usuario_id = ANY($2::int[]))) AS respostas,
                (SELECT count(*)::int FROM progresso p WHERE p.atividade_id = a.id AND p.status = 'concluida' AND ($2::int[] IS NULL OR p.usuario_id = ANY($2::int[]))) AS concluidas,
                (SELECT count(*)::int FROM usuarios u WHERE u.papel = 'jovem' AND u.status = 'ativo' AND ($2::int[] IS NULL OR u.id = ANY($2::int[])) AND ${SQL_JOVEM_ELEGIVEL}) AS destinatarios
           FROM atividades a LEFT JOIN arquivos f ON f.id = a.arquivo_id
          WHERE ($1::int[] IS NULL OR a.para_todos OR a.criado_por = $3 OR EXISTS (SELECT 1 FROM atividade_grupos ag WHERE ag.atividade_id = a.id AND ag.grupo_id = ANY($1::int[])))
            AND ($4::text IS NULL OR a.status = $4)
          ORDER BY a.publicar_em DESC`,
        [g, v, u.id, status],
      ),
    );
  });

  r('POST', '/painel/atividades', async ({ req, body, ip }) => {
    const u = await equipe(req);
    const id = await salvarAtividade(u, body);
    await auditar(u, 'atividade_criada', { atividade: id }, ip);
    return json(await lerAtividadeCompleta(id), 201);
  });

  r('GET', '/painel/atividades/:id', async ({ req, params }) => {
    const u = await equipe(req);
    await exigeAtividadePainel(u, params.id);
    return json(await lerAtividadeCompleta(params.id));
  });

  r('PUT', '/painel/atividades/:id', async ({ req, params, body, ip }) => {
    const u = await equipe(req);
    await exigeAtividadePainel(u, params.id, true);
    await salvarAtividade(u, body, Number(params.id));
    await auditar(u, 'atividade_editada', { atividade: Number(params.id) }, ip);
    return json(await lerAtividadeCompleta(params.id));
  });

  r('POST', '/painel/atividades/:id/publicar', async ({ req, params, body, ip }) => {
    const u = await equipe(req);
    const a = await exigeAtividadePainel(u, params.id, true);
    if (!a.arquivo_id && !a.descricao) falha(400, 'Adicione um PDF ou uma apresentação antes de publicar.');
    await q("UPDATE atividades SET status = 'publicada', atualizado_em = now() WHERE id = $1", [a.id]);
    let push = null;
    if (bool(body.notificar)) {
      if (new Date(a.publicar_em) <= new Date()) push = await enviarAvisoAtividade(u, a);
      else await q('UPDATE atividades SET notificar = true, notificado_em = NULL WHERE id = $1', [a.id]);
    }
    await auditar(u, 'atividade_publicada', { atividade: a.id, notificar: bool(body.notificar) }, ip);
    return json({ ok: true, push, agendada: new Date(a.publicar_em) > new Date() });
  });

  r('POST', '/painel/atividades/:id/arquivar', async ({ req, params, ip }) => {
    const u = await equipe(req);
    const a = await exigeAtividadePainel(u, params.id, true);
    await q("UPDATE atividades SET status = 'arquivada', notificar = false, atualizado_em = now() WHERE id = $1", [a.id]);
    await auditar(u, 'atividade_arquivada', { atividade: a.id }, ip);
    return json({ ok: true });
  });

  r('POST', '/painel/atividades/:id/rascunho', async ({ req, params, ip }) => {
    const u = await equipe(req);
    const a = await exigeAtividadePainel(u, params.id, true);
    await q("UPDATE atividades SET status = 'rascunho', notificar = false, atualizado_em = now() WHERE id = $1", [a.id]);
    await auditar(u, 'atividade_despublicada', { atividade: a.id }, ip);
    return json({ ok: true });
  });

  r('DELETE', '/painel/atividades/:id', async ({ req, params, ip }) => {
    const u = await equipe(req);
    const a = await exigeAtividadePainel(u, params.id, true);
    const n = await q1('SELECT count(*)::int AS n FROM respostas WHERE atividade_id = $1', [a.id]);
    if (n.n > 0) falha(400, 'Esta atividade já tem respostas. Use "Arquivar" para guardá-la.');
    await q('DELETE FROM atividades WHERE id = $1', [a.id]);
    if (a.arquivo_id && !(await q1('SELECT 1 FROM atividades WHERE arquivo_id = $1 LIMIT 1', [a.arquivo_id]))) {
      const loja = await pdfs();
      const { blobs } = await loja.list({ prefix: `${a.arquivo_id}/` });
      for (const b of blobs) await loja.delete(b.key);
      await q('DELETE FROM arquivos WHERE id = $1', [a.arquivo_id]);
    }
    await auditar(u, 'atividade_excluida', { atividade: a.id, titulo: a.titulo }, ip);
    return json({ ok: true });
  });

  r('GET', '/painel/atividades/:id/pendentes', async ({ req, params }) => {
    const u = await equipe(req);
    await exigeAtividadePainel(u, params.id);
    const v = await jovensVisiveis(u);
    return json(
      await q(
        `SELECT u.id, u.nome, u.email, p.status AS progresso FROM usuarios u JOIN atividades a ON a.id = $1
           LEFT JOIN progresso p ON p.atividade_id = a.id AND p.usuario_id = u.id
          WHERE u.papel = 'jovem' AND u.status = 'ativo' AND ($2::int[] IS NULL OR u.id = ANY($2::int[])) AND ${SQL_JOVEM_ELEGIVEL}
            AND NOT EXISTS (SELECT 1 FROM respostas r WHERE r.atividade_id = a.id AND r.usuario_id = u.id)
          ORDER BY u.nome`,
        [params.id, v],
      ),
    );
  });

  // ---------- RESPOSTAS (FEEDBACK) ----------
  r('GET', '/painel/respostas', async ({ req, url }) => {
    const u = await equipe(req);
    const v = await jovensVisiveis(u);
    const sp = url.searchParams;
    const lista = await q(
      `SELECT r.id, r.enviada_em, r.lida_em, r.comentario, u.id AS jovem_id, u.nome AS jovem, a.id AS atividade_id, a.titulo AS atividade, a.categoria
         FROM respostas r JOIN usuarios u ON u.id = r.usuario_id JOIN atividades a ON a.id = r.atividade_id
        WHERE ($1::int[] IS NULL OR u.id = ANY($1::int[]))
          AND ($2::int IS NULL OR u.id = $2) AND ($3::int IS NULL OR a.id = $3)
          AND ($4::date IS NULL OR (r.enviada_em AT TIME ZONE 'America/Sao_Paulo')::date >= $4)
          AND ($5::date IS NULL OR (r.enviada_em AT TIME ZONE 'America/Sao_Paulo')::date <= $5)
        ORDER BY r.enviada_em DESC LIMIT 2000`,
      [v, Number(sp.get('jovem')) || null, Number(sp.get('atividade')) || null, dataValida(sp.get('de')), dataValida(sp.get('ate'))],
    );
    if (lista.length) {
      const itens = await q(
        `SELECT ri.resposta_id, ri.pergunta_id, p.texto AS pergunta, p.tipo, ri.valor FROM resposta_itens ri JOIN perguntas p ON p.id = ri.pergunta_id
          WHERE ri.resposta_id = ANY($1::int[]) ORDER BY p.ordem, p.id`,
        [lista.map((l) => l.id)],
      );
      for (const l of lista) l.itens = itens.filter((i) => i.resposta_id === l.id);
    }
    return json(lista);
  });

  r('GET', '/painel/respostas/:id', async ({ req, params, ip }) => {
    const u = await equipe(req);
    const resp = await q1(
      `SELECT r.id, r.enviada_em, r.lida_em, r.comentario, r.usuario_id AS jovem_id, u.nome AS jovem, a.id AS atividade_id, a.titulo AS atividade
         FROM respostas r JOIN usuarios u ON u.id = r.usuario_id JOIN atividades a ON a.id = r.atividade_id WHERE r.id = $1`,
      [params.id],
    );
    if (!resp) falha(404, 'Resposta não encontrada.');
    await exigeJovemVisivel(u, resp.jovem_id);
    resp.itens = await q(
      `SELECT p.id AS pergunta_id, p.texto AS pergunta, p.tipo, p.opcoes, ri.valor FROM perguntas p
         LEFT JOIN resposta_itens ri ON ri.pergunta_id = p.id AND ri.resposta_id = $1 WHERE p.atividade_id = $2 ORDER BY p.ordem, p.id`,
      [resp.id, resp.atividade_id],
    );
    resp.observacoes = await q('SELECT o.id, o.texto, o.criado_em, us.nome AS autor FROM observacoes o LEFT JOIN usuarios us ON us.id = o.autor_id WHERE o.resposta_id = $1 ORDER BY o.criado_em', [resp.id]);
    if (!resp.lida_em) await q('UPDATE respostas SET lida_em = now() WHERE id = $1', [resp.id]);
    await auditar(u, 'resposta_consultada', { resposta: resp.id, jovem: resp.jovem_id }, ip);
    return json(resp);
  });

  r('POST', '/painel/auditoria/evento', async ({ req, body, ip }) => {
    const u = await equipe(req);
    const acao = ['relatorio_exportado_pdf', 'relatorio_exportado_excel'].includes(body.acao) ? body.acao : null;
    if (!acao) falha(400, 'Ação inválida.');
    await auditar(u, acao, body.filtros || null, ip);
    return json({ ok: true });
  });

  r('GET', '/painel/auditoria', async ({ req }) => {
    await admin(req);
    return json(await q('SELECT a.id, a.acao, a.detalhe, a.ip, a.criado_em, u.nome AS usuario FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT 500'));
  });

  // ---------- FAMÍLIA GUANELLIANA ----------
  r('GET', '/painel/conteudos', async ({ req }) => {
    await equipe(req);
    return json(await q('SELECT * FROM conteudos ORDER BY secao, ordem, id'));
  });

  async function salvarConteudo(body, id) {
    const secao = Object.keys(SECOES).includes(body.secao) ? body.secao : null;
    if (!secao) falha(400, 'Escolha a seção.');
    const titulo = texto(body.titulo, 200);
    if (!titulo) falha(400, 'Informe o título.');
    let video = texto(body.video_url, 500) || null;
    if (video && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//i.test(video)) falha(400, 'Use um link de vídeo do YouTube ou Vimeo.');
    const vals = [secao, titulo, texto(body.texto, 50000), texto(body.imagem_key, 200) || null, video, Number(body.ordem) || 0, body.publicado !== false];
    if (id) {
      await q('UPDATE conteudos SET secao=$1, titulo=$2, texto=$3, imagem_key=$4, video_url=$5, ordem=$6, publicado=$7, atualizado_em=now() WHERE id=$8', [...vals, id]);
      return id;
    }
    return (await q1('INSERT INTO conteudos (secao, titulo, texto, imagem_key, video_url, ordem, publicado) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', vals)).id;
  }

  r('POST', '/painel/conteudos', async ({ req, body, ip }) => {
    const u = await admin(req);
    const id = await salvarConteudo(body);
    await auditar(u, 'conteudo_criado', { conteudo: id }, ip);
    return json({ id }, 201);
  });

  r('PUT', '/painel/conteudos/:id', async ({ req, params, body, ip }) => {
    const u = await admin(req);
    await salvarConteudo(body, Number(params.id));
    await auditar(u, 'conteudo_editado', { conteudo: Number(params.id) }, ip);
    return json({ ok: true });
  });

  r('DELETE', '/painel/conteudos/:id', async ({ req, params, ip }) => {
    const u = await admin(req);
    await q('DELETE FROM conteudos WHERE id = $1', [params.id]);
    await auditar(u, 'conteudo_excluido', { conteudo: Number(params.id) }, ip);
    return json({ ok: true });
  });

  // ---------- LITURGIA ----------
  r('GET', '/painel/liturgia', async ({ req, url }) => {
    await equipe(req);
    const iso = dataValida(url.searchParams.get('data')) || hojeBrasil();
    const l = await obterLiturgia(iso);
    return json(l || { data: iso, tempo: tempoLiturgico(iso), titulo: '', cor: '', primeira_leitura: [], salmo: [], segunda_leitura: [], evangelho: [], reflexao: '', santo: '', fonte: '', manual: false, indisponivel: true });
  });

  r('PUT', '/painel/liturgia/:data', async ({ req, params, body, ip }) => {
    const u = await admin(req);
    const iso = dataValida(params.data);
    if (!iso) falha(400, 'Data inválida.');
    const lista = (v) => (Array.isArray(v) ? v : []).map((x) => ({ referencia: texto(x.referencia, 200), titulo: texto(x.titulo, 300), refrao: texto(x.refrao, 500), texto: texto(x.texto, 20000) })).filter((x) => x.texto || x.referencia);
    const c = {
      data: iso, titulo: texto(body.titulo, 300), cor: texto(body.cor, 40), tempo: texto(body.tempo, 60) || tempoLiturgico(iso),
      primeira_leitura: lista(body.primeira_leitura), salmo: lista(body.salmo), segunda_leitura: lista(body.segunda_leitura), evangelho: lista(body.evangelho),
      reflexao: texto(body.reflexao, 20000), santo: texto(body.santo, 2000), fonte: texto(body.fonte, 300),
    };
    await q(
      `INSERT INTO liturgia (data, conteudo, fonte, manual, atualizado_por, atualizado_em) VALUES ($1,$2,$3,true,$4, now())
       ON CONFLICT (data) DO UPDATE SET conteudo = EXCLUDED.conteudo, fonte = EXCLUDED.fonte, manual = true, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`,
      [iso, JSON.stringify(c), c.fonte, u.id],
    );
    await auditar(u, 'liturgia_editada', { data: iso }, ip);
    return json({ ok: true });
  });

  r('POST', '/painel/liturgia/:data/recarregar', async ({ req, params, ip }) => {
    const u = await admin(req);
    const iso = dataValida(params.data);
    if (!iso) falha(400, 'Data inválida.');
    let c;
    try {
      c = await buscarFonte(iso);
    } catch (e) {
      falha(502, 'A fonte da liturgia não respondeu: ' + e.message);
    }
    await q(
      `INSERT INTO liturgia (data, conteudo, fonte, manual, atualizado_em) VALUES ($1,$2,$3,false, now())
       ON CONFLICT (data) DO UPDATE SET conteudo = EXCLUDED.conteudo, fonte = EXCLUDED.fonte, manual = false, atualizado_por = NULL, atualizado_em = now()`,
      [iso, JSON.stringify(c), c.fonte],
    );
    await auditar(u, 'liturgia_recarregada', { data: iso }, ip);
    return json({ ...c, manual: false });
  });

  r('GET', '/painel/liturgia-historico', async ({ req }) => {
    await equipe(req);
    return json(await q(`SELECT to_char(l.data,'YYYY-MM-DD') AS data, l.conteudo->>'titulo' AS titulo, l.manual, l.fonte, l.atualizado_em, u.nome AS atualizado_por
      FROM liturgia l LEFT JOIN usuarios u ON u.id = l.atualizado_por ORDER BY l.data DESC LIMIT 400`));
  });

  // ---------- CONFIGURAÇÕES ----------
  r('GET', '/painel/config', async ({ req }) => {
    await equipe(req);
    return json(await configCompleta());
  });

  r('PUT', '/painel/config', async ({ req, body, ip }) => {
    const u = await admin(req);
    if (body.nome_app !== undefined) {
      const n = texto(body.nome_app, 80);
      if (!n) falha(400, 'Informe o nome do aplicativo.');
      await setConfig('nome_app', n);
    }
    if (body.mensagem_espiritual !== undefined) await setConfig('mensagem_espiritual', texto(body.mensagem_espiritual, 1000));
    if (body.contato) {
      const c = {};
      for (const k of Object.keys(CONFIG_PADRAO.contato)) c[k] = texto(body.contato[k], k === 'apresentacao' || k === 'encontros' ? 4000 : 200);
      c.whatsapp = c.whatsapp.replace(/\D/g, '');
      await setConfig('contato', c);
    }
    if (body.liturgia_fonte !== undefined) {
      const f = texto(body.liturgia_fonte, 300);
      if (!/^https:\/\//.test(f)) falha(400, 'A fonte da liturgia deve ser um endereço https://');
      await setConfig('liturgia_fonte', f);
      await setConfig('liturgia_fonte_nome', texto(body.liturgia_fonte_nome, 200) || new URL(f).host);
    }
    await auditar(u, 'configuracao_alterada', Object.keys(body), ip);
    return json(await configCompleta());
  });

  // ---------- NOTIFICAÇÕES ----------
  r('GET', '/painel/notificacoes', async ({ req }) => {
    const u = await equipe(req);
    const meu = u.papel === 'admin' ? '' : 'WHERE n.enviada_por = $1';
    return json(await q(`SELECT n.*, u.nome AS enviada_por_nome FROM notificacoes n LEFT JOIN usuarios u ON u.id = n.enviada_por ${meu} ORDER BY n.criada_em DESC LIMIT 200`, meu ? [u.id] : []));
  });

  r('POST', '/painel/notificacoes', async ({ req, body, ip }) => {
    const u = await equipe(req);
    const titulo = texto(body.titulo, 120);
    const corpo = texto(body.corpo, 500);
    if (!titulo || !corpo) falha(400, 'Informe o título e a mensagem.');
    let paraTodos = bool(body.para_todos);
    let grupos = ids(body.grupos);
    let usuarios = ids(body.usuarios);
    if (u.papel !== 'admin') {
      const meusG = await gruposVisiveis(u);
      const meusJ = await jovensVisiveis(u);
      if (paraTodos) { paraTodos = false; grupos = meusG; }
      grupos = grupos.filter((g) => meusG.includes(g));
      usuarios = usuarios.filter((j) => meusJ.includes(j));
    }
    if (!paraTodos && !grupos.length && !usuarios.length) falha(400, 'Escolha os destinatários.');
    const ultima = await q1("SELECT count(*)::int AS n FROM notificacoes WHERE enviada_por = $1 AND criada_em > now() - interval '10 minutes'", [u.id]);
    if (ultima.n >= 5) falha(429, 'Muitas notificações em pouco tempo. Aguarde alguns minutos para não sobrecarregar os jovens.');
    const res = await notificar({ titulo, corpo, paraTodos, grupos, usuarios, autor: u, dados: { tipo: 'aviso' } });
    await auditar(u, 'notificacao_enviada', { para_todos: paraTodos, grupos, usuarios: usuarios.length }, ip);
    return json({ ok: true, ...res });
  });

  // ---------- MENSAGENS (CONTATO) ----------
  r('GET', '/painel/mensagens', async ({ req }) => {
    const u = await equipe(req);
    const v = await jovensVisiveis(u);
    return json(
      await q(
        `SELECT m.*, u.nome AS jovem, us.nome AS respondida_por_nome FROM mensagens m JOIN usuarios u ON u.id = m.usuario_id
           LEFT JOIN usuarios us ON us.id = m.respondida_por
          WHERE ($1::int[] IS NULL OR u.id = ANY($1::int[])) ORDER BY (m.resposta IS NULL) DESC, m.criado_em DESC LIMIT 500`,
        [v],
      ),
    );
  });

  r('POST', '/painel/mensagens/:id/responder', async ({ req, params, body, ip }) => {
    const u = await equipe(req);
    const m = await q1('SELECT * FROM mensagens WHERE id = $1', [params.id]);
    if (!m) falha(404, 'Mensagem não encontrada.');
    await exigeJovemVisivel(u, m.usuario_id);
    const t = texto(body.resposta, 4000);
    if (!t) falha(400, 'Escreva a resposta.');
    await q('UPDATE mensagens SET resposta = $1, respondida_em = now(), respondida_por = $2 WHERE id = $3', [t, u.id, m.id]);
    await notificar({ titulo: 'Você recebeu uma resposta', corpo: t.length > 120 ? t.slice(0, 117) + '...' : t, usuarios: [m.usuario_id], autor: u, dados: { tipo: 'mensagem' } });
    await auditar(u, 'mensagem_respondida', { mensagem: m.id }, ip);
    return json({ ok: true });
  });

  // ---------- RECUPERAÇÃO DE ACESSO ----------
  r('GET', '/painel/recuperacoes', async ({ req }) => {
    const u = await equipe(req);
    const v = await jovensVisiveis(u);
    return json(
      await q(
        `SELECT DISTINCT ON (r.usuario_id) r.id, r.usuario_id, r.criado_em, r.email_enviado, u.nome, u.email, u.papel
           FROM recuperacao_senha r JOIN usuarios u ON u.id = r.usuario_id
          WHERE NOT r.atendido AND NOT r.usado AND r.criado_em > now() - interval '7 days'
            AND (u.papel = 'jovem' AND ($1::int[] IS NULL OR u.id = ANY($1::int[])) OR (u.papel <> 'jovem' AND $1::int[] IS NULL))
          ORDER BY r.usuario_id, r.criado_em DESC`,
        [v],
      ),
    );
  });

  r('POST', '/painel/recuperacoes/:usuario/atendido', async ({ req, params }) => {
    const u = await equipe(req);
    const alvo = await q1('SELECT papel FROM usuarios WHERE id = $1', [Number(params.usuario) || 0]);
    if (!alvo) falha(404, 'Usuário não encontrado.');
    if (alvo.papel === 'jovem') await exigeJovemVisivel(u, params.usuario);
    else if (u.papel !== 'admin') falha(403, 'Somente administradores podem fazer isso.');
    await q('UPDATE recuperacao_senha SET atendido = true WHERE usuario_id = $1', [params.usuario]);
    return json({ ok: true });
  });
}
