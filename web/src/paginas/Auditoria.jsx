import React from 'react';
import { api, fmtDataHora } from '../api.js';
import { useCarregar } from '../App.jsx';

export default function Auditoria() {
  const [lista, erro] = useCarregar(() => api('/painel/auditoria'));
  return (
    <>
      <h1>Registros de acesso</h1>
      <p className="mudo">Histórico das ações da equipe (LGPD): quem consultou ou alterou dados, quando e de onde. Mostra os 500 registros mais recentes.</p>
      {erro && <div className="erro">{erro}</div>}
      <table><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhes</th><th>IP</th></tr></thead><tbody>
        {(lista || []).map((a) => <tr key={a.id}><td>{fmtDataHora(a.criado_em)}</td><td>{a.usuario || '—'}</td><td>{a.acao.replaceAll('_', ' ')}</td><td className="mudo" style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.detalhe ? JSON.stringify(a.detalhe) : ''}</td><td className="mudo">{a.ip}</td></tr>)}
      </tbody></table>
    </>
  );
}
