import React, { useState } from 'react';
import { api } from '../api.js';
import { useCarregar, useSessao, Modal } from '../App.jsx';

export default function Grupos() {
  const { admin } = useSessao();
  const [grupos, erro, recarregar] = useCarregar(() => api('/painel/grupos'));
  const [jovens] = useCarregar(() => api('/painel/jovens'));
  const [equipe] = useCarregar(() => (admin ? api('/painel/equipe') : Promise.resolve([])));
  const [ed, setEd] = useState(null);
  const [msg, setMsg] = useState('');
  async function salvar() {
    setMsg('');
    try {
      const corpo = { nome: ed.nome, descricao: ed.descricao, membros: ed.membros, responsaveis: ed.responsaveis };
      if (ed.id) await api('/painel/grupos/' + ed.id, { metodo: 'PUT', corpo });
      else await api('/painel/grupos', { metodo: 'POST', corpo });
      setEd(null);
      recarregar();
    } catch (e) { setMsg(e.message); }
  }
  async function excluir(g) {
    if (!confirm(`Excluir o grupo "${g.nome}"? Os jovens continuam cadastrados.`)) return;
    try { await api('/painel/grupos/' + g.id, { metodo: 'DELETE' }); recarregar(); } catch (e) { alert(e.message); }
  }
  const alternar = (campo, id) => setEd({ ...ed, [campo]: ed[campo].includes(id) ? ed[campo].filter((x) => x !== id) : [...ed[campo], id] });
  return (
    <>
      <h1>Grupos</h1>
      <p className="mudo">Os grupos organizam os jovens e definem quais responsáveis acompanham cada um. Atividades e avisos podem ser enviados para grupos específicos.</p>
      {admin && <div className="acoes"><button onClick={() => setEd({ nome: '', descricao: '', membros: [], responsaveis: [] })}>Novo grupo</button></div>}
      {erro && <div className="erro">{erro}</div>}
      <table><thead><tr><th>Grupo</th><th>Jovens</th><th>Responsáveis</th><th></th></tr></thead><tbody>
        {(grupos || []).map((g) => (
          <tr key={g.id}>
            <td><b>{g.nome}</b><div className="mudo">{g.descricao}</div></td>
            <td>{g.membros.length}</td>
            <td>{g.responsaveis.map((r) => <span key={r.id} className="tag">{r.nome}</span>)}</td>
            <td className="acoes">
              <button className="sec" onClick={() => setEd({ id: g.id, nome: g.nome, descricao: g.descricao || '', membros: g.membros, responsaveis: g.responsaveis.map((r) => r.id) })}>Editar</button>
              {admin && <button className="perigo" onClick={() => excluir(g)}>Excluir</button>}
            </td>
          </tr>
        ))}
        {grupos && !grupos.length && <tr><td colSpan={4} className="mudo">Nenhum grupo ainda.</td></tr>}
      </tbody></table>
      {ed && (
        <Modal fechar={() => setEd(null)}>
          <h2 style={{ marginTop: 0 }}>{ed.id ? 'Editar grupo' : 'Novo grupo'}</h2>
          <label>Nome</label><input value={ed.nome} disabled={!admin} onChange={(e) => setEd({ ...ed, nome: e.target.value })} />
          <label>Descrição</label><input value={ed.descricao} disabled={!admin} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} />
          {admin && (<><label>Responsáveis vocacionais</label>
            <div>{(equipe || []).map((p) => <label key={p.id} className="check"><input type="checkbox" checked={ed.responsaveis.includes(p.id)} onChange={() => alternar('responsaveis', p.id)} /> {p.nome} <span className="mudo">({p.papel === 'admin' ? 'administrador' : 'responsável'})</span></label>)}</div></>)}
          <label>Jovens do grupo</label>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--borda)', borderRadius: 8, padding: 8 }}>
            {(jovens || []).map((j) => <label key={j.id} className="check"><input type="checkbox" checked={ed.membros.includes(j.id)} onChange={() => alternar('membros', j.id)} /> {j.nome} <span className="mudo">{j.email}</span></label>)}
            {jovens && !jovens.length && <span className="mudo">Nenhum jovem cadastrado.</span>}
          </div>
          {msg && <div className="erro">{msg}</div>}
          <div className="acoes"><button onClick={salvar}>Salvar</button><button className="sec" onClick={() => setEd(null)}>Cancelar</button></div>
        </Modal>
      )}
    </>
  );
}
