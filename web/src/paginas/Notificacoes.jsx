import React, { useState } from 'react';
import { api, fmtDataHora } from '../api.js';
import { useCarregar, useSessao } from '../App.jsx';

export default function Notificacoes() {
  const { admin } = useSessao();
  const [lista, erro, recarregar] = useCarregar(() => api('/painel/notificacoes'));
  const [grupos] = useCarregar(() => api('/painel/grupos'));
  const [jovens] = useCarregar(() => api('/painel/jovens?status=ativo'));
  const [status] = useCarregar(() => api('/painel/status'));
  const [f, setF] = useState({ titulo: '', corpo: '', destino: admin ? 'todos' : 'grupos', grupos: [], usuarios: [] });
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const alternar = (k, id) => setF({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] });
  async function enviar() {
    setMsg(''); setOk('');
    try {
      const r = await api('/painel/notificacoes', { metodo: 'POST', corpo: { titulo: f.titulo, corpo: f.corpo, para_todos: f.destino === 'todos', grupos: f.destino === 'grupos' ? f.grupos : [], usuarios: f.destino === 'jovens' ? f.usuarios : [] } });
      setOk(`Aviso registrado. Entregue como notificação em ${r.entregues} aparelho(s); também aparece na área de avisos do app.`);
      setF({ ...f, titulo: '', corpo: '' });
      recarregar();
    } catch (e) { setMsg(e.message); }
  }
  return (
    <>
      <h1>Notificações e comunicados</h1>
      {status && !status.push && <div className="aviso">O envio de notificações push não está configurado no servidor. Os avisos ficam visíveis dentro do app.</div>}
      <div className="cartao">
        <p className="mudo" style={{ marginTop: 0 }}>Use com moderação: no máximo 5 avisos a cada 10 minutos. Novas orações podem avisar os jovens automaticamente ao publicar.</p>
        <label>Título</label><input maxLength={120} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Encontro vocacional no sábado" />
        <label>Mensagem</label><textarea maxLength={500} value={f.corpo} onChange={(e) => setF({ ...f, corpo: e.target.value })} />
        <label>Enviar para</label>
        <select value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value })} style={{ maxWidth: 300 }}>
          {admin && <option value="todos">Todos os jovens</option>}<option value="grupos">Grupos escolhidos</option><option value="jovens">Jovens escolhidos</option>
        </select>
        {f.destino === 'grupos' && <div>{(grupos || []).map((g) => <label key={g.id} className="check"><input type="checkbox" checked={f.grupos.includes(g.id)} onChange={() => alternar('grupos', g.id)} /> {g.nome}</label>)}</div>}
        {f.destino === 'jovens' && <div style={{ maxHeight: 220, overflowY: 'auto' }}>{(jovens || []).map((j) => <label key={j.id} className="check"><input type="checkbox" checked={f.usuarios.includes(j.id)} onChange={() => alternar('usuarios', j.id)} /> {j.nome}</label>)}</div>}
        {msg && <div className="erro">{msg}</div>}{ok && <div className="ok">{ok}</div>}
        <div className="acoes"><button onClick={enviar} disabled={!f.titulo.trim() || !f.corpo.trim()}>Enviar aviso</button></div>
      </div>
      <h2>Histórico</h2>
      {erro && <div className="erro">{erro}</div>}
      <table><thead><tr><th>Data</th><th>Aviso</th><th>Destino</th><th>Entregues</th><th>Por</th></tr></thead><tbody>
        {(lista || []).map((n) => (
          <tr key={n.id}><td>{fmtDataHora(n.criada_em)}</td><td><b>{n.titulo}</b><div className="mudo">{n.corpo}</div></td>
            <td>{n.para_todos ? 'Todos' : [n.grupos?.length && `${n.grupos.length} grupo(s)`, n.usuarios?.length && `${n.usuarios.length} jovem(ns)`].filter(Boolean).join(', ') || '—'}</td>
            <td>{n.entregues ?? '—'}</td><td>{n.enviada_por_nome || 'Sistema'}</td></tr>
        ))}
      </tbody></table>
    </>
  );
}
