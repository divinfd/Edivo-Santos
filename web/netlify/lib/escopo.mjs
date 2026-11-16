import { q, q1, falha } from './core.mjs';

export async function jovensVisiveis(u) {
  if (u.papel === 'admin') return null;
  const r = await q(
    `SELECT DISTINCT gm.usuario_id AS id FROM grupo_membros gm
       JOIN grupo_responsaveis gr ON gr.grupo_id = gm.grupo_id WHERE gr.usuario_id = $1`,
    [u.id],
  );
  return r.map((x) => x.id);
}

export async function gruposVisiveis(u) {
  if (u.papel === 'admin') return null;
  const r = await q('SELECT grupo_id AS id FROM grupo_responsaveis WHERE usuario_id = $1', [u.id]);
  return r.map((x) => x.id);
}

export async function exigeJovemVisivel(u, id) {
  const v = await jovensVisiveis(u);
  const j = await q1("SELECT id FROM usuarios WHERE id = $1 AND papel = 'jovem'", [id]);
  if (!j || (v && !v.includes(Number(id)))) falha(404, 'Jovem não encontrado.');
}

export const SQL_ATIVIDADE_VISIVEL_JOVEM = `(
  a.publicar_em <= now() AND (
    a.status = 'publicada'
    OR (a.status = 'arquivada' AND (EXISTS (SELECT 1 FROM progresso p2 WHERE p2.atividade_id = a.id AND p2.usuario_id = $1)
                                  OR EXISTS (SELECT 1 FROM respostas r2 WHERE r2.atividade_id = a.id AND r2.usuario_id = $1)))
  ) AND (
    a.para_todos OR EXISTS (SELECT 1 FROM atividade_grupos ag JOIN grupo_membros gm ON gm.grupo_id = ag.grupo_id
                             WHERE ag.atividade_id = a.id AND gm.usuario_id = $1)
  ))`;

export async function exigeAtividadeVisivelJovem(u, id) {
  const a = await q1(`SELECT a.* FROM atividades a WHERE a.id = $2 AND ${SQL_ATIVIDADE_VISIVEL_JOVEM}`, [u.id, id]);
  if (!a) falha(404, 'Atividade não encontrada.');
  return a;
}

export async function exigeAtividadePainel(u, id, edicao = false) {
  const a = await q1('SELECT * FROM atividades WHERE id = $1', [id]);
  if (!a) falha(404, 'Atividade não encontrada.');
  if (u.papel === 'admin') return a;
  if (edicao) {
    if (a.criado_por !== u.id) falha(403, 'Somente quem criou esta atividade (ou um administrador) pode alterá-la.');
    return a;
  }
  const g = await gruposVisiveis(u);
  const ok = a.para_todos || a.criado_por === u.id || (await q1('SELECT 1 FROM atividade_grupos WHERE atividade_id = $1 AND grupo_id = ANY($2::int[])', [id, g]));
  if (!ok) falha(404, 'Atividade não encontrada.');
  return a;
}

export const SQL_JOVEM_ELEGIVEL = `(
  a.para_todos OR EXISTS (SELECT 1 FROM atividade_grupos ag JOIN grupo_membros gm ON gm.grupo_id = ag.grupo_id
                           WHERE ag.atividade_id = a.id AND gm.usuario_id = u.id))`;
