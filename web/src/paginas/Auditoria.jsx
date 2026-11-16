import React, { useState } from 'react';
import { api, fmtDataHora } from '../api.js';
import { useCarregar } from '../App.jsx';

export default function Auditoria() {
  const [lista, erro, recarregar] = useCarregar(() => api('/painel/auditoria'));
  const [p, setP] = useState({ de: '', ate: '' });
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  async function excluirUm(a) {
    if (!confirm('Excluir este registro de acesso?')) return;
    setMsg(''); setOk('');
    try { await api('/painel/auditoria/' + a.id, { metodo: 'DELETE' }); recarregar(); } catch (e) { setMsg(e.message); }
  }
  async function excluirPeriodo() {
    setMsg(''); setOk('');
    if (!p.de || !p.ate) return setMsg('Escolha a data inicial e a data final.');
    if (!confirm(`Excluir todos os registros de ${p.de.split('-').reverse().join('/')} até ${p.ate.split('-').reverse().join('/')}? Esta ação não pode ser desfeita.`)) return;
    try { const r = await api('/painel/auditoria/excluir-periodo', { metodo: 'POST', corpo: p }); setOk(`${r.excluidos} registro(s) excluído(s).`); recarregar(); } catch (e) { setMsg(e.message); }
  }
  return (
    <>
      <h1>Registros de acesso</h1>
      <p className="mudo">Histórico das ações da equipe (LGPD): quem consultou ou alterou dados, quando e de onde. Mostra os 500 registros mais recentes.</p>
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Excluir registros por período</h2>
        <div className="linha">
          <div><label>De</label><input type="date" value={p.de} onChange={(e) => setP({ ...p, de: e.target.value })} /></div>
          <div><label>Até</label><input type="date" value={p.ate} onChange={(e) => setP({ ...p, ate: e.target.value })} /></div>
        </div>
        <div className="acoes"><button className="perigo" onClick={excluirPeriodo}>Excluir registros do período</button></div>
        <p className="mudo">A exclusão fica anotada como um novo registro, para manter a transparência.</p>
      </div>
      {(erro || msg) && <div className="erro">{erro || msg}</div>}{ok && <div className="ok">{ok}</div>}
      <table><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Detalhes</th><th>IP</th><th></th></tr></thead><tbody>
        {(lista || []).map((a) => <tr key={a.id}><td>{fmtDataHora(a.criado_em)}</td><td>{a.usuario || '—'}</td><td>{a.acao.replaceAll('_', ' ')}</td><td className="mudo" style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.detalhe ? JSON.stringify(a.detalhe) : ''}</td><td className="mudo">{a.ip}</td><td><button className="perigo" onClick={() => excluirUm(a)}>Excluir</button></td></tr>)}
      </tbody></table>
    </>
  );
}
