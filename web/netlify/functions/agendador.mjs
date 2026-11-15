import { q } from '../lib/core.mjs';
import { enviarAvisoAtividade } from '../lib/rotas-painel.mjs';

export default async () => {
  const pendentes = await q("SELECT * FROM atividades WHERE status = 'publicada' AND notificar AND notificado_em IS NULL AND publicar_em <= now()");
  for (const a of pendentes) {
    try {
      await enviarAvisoAtividade({ id: a.criado_por }, a);
    } catch (e) {
      console.error('agendador', a.id, e);
    }
  }
  await q('DELETE FROM sessoes WHERE expira_em < now()');
  return new Response(`ok ${pendentes.length}`);
};

export const config = { schedule: '*/15 * * * *' };
