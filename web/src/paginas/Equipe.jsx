import React, { useState } from 'react';
import { api, fmtDataHora } from '../api.js';
import { useCarregar, Modal } from '../App.jsx';

export default function Equipe() {
  const [lista, erro, recarregar] = useCarregar(() => api('/painel/equipe'));
  const [grupos] = useCarregar(() => api('/painel/grupos'));
  const [ed, setEd] = useState(null);
  const [msg, setMsg] = useState('');
  const [senha, setSenha] = useState(null);
  async function salvar() {
    setMsg('');
    try {
      if (ed.id) await api('/painel/equipe/' + ed.id, { metodo: 'PUT', corpo: ed });
      else {
        const r = await api('/painel/equipe', { metodo: 'POST', corpo: ed });
        setSenha({ nome: ed.nome, email: ed.email, senha: r.senha_inicial });
      }
      setEd(null);
      recarregar();
    } catch (e) { setMsg(e.message); }
  }
  async function novaSenha(p) {
    if (!confirm(`Gerar uma nova senha para ${p.nome}? A senha atual deixará de funcionar.`)) return;
    try { const r = await api(`/painel/equipe/${p.id}/senha`, { metodo: 'POST', corpo: {} }); setSenha({ nome: p.nome, email: p.email, senha: r.senha_temporaria }); } catch (e) { alert(e.message); }
  }
  async function excluir(p) {
    if (!confirm(`Excluir ${p.nome} da equipe? A conta será apagada e não poderá ser recuperada.`)) return;
    try { await api('/painel/equipe/' + p.id, { metodo: 'DELETE' }); recarregar(); } catch (e) { alert(e.message); }
  }
  const alternar = (id) => setEd({ ...ed, grupos: ed.grupos.includes(id) ? ed.grupos.filter((x) => x !== id) : [...ed.grupos, id] });
  return (
    <>
      <h1>Equipe</h1>
      <p className="mudo"><b>Administrador</b>: acesso completo. <b>Responsável vocacional</b>: vê somente os jovens dos grupos que acompanha.</p>
      <div className="acoes"><button onClick={() => setEd({ nome: '', email: '', telefone: '', papel: 'responsavel', status: 'ativo', grupos: [] })}>Cadastrar responsável</button></div>
      {erro && <div className="erro">{erro}</div>}
      {senha && <div className="ok">Acesso de <b>{senha.nome}</b>: e-mail <b>{senha.email}</b> e senha temporária <b style={{ fontFamily: 'monospace', fontSize: 16 }}>{senha.senha}</b>. Entregue pessoalmente e peça para trocar em "Minha conta". <button className="link" onClick={() => setSenha(null)}>fechar</button></div>}
      <table><thead><tr><th>Nome</th><th>Função</th><th>Grupos</th><th>Último acesso</th><th></th></tr></thead><tbody>
        {(lista || []).map((p) => (
          <tr key={p.id}>
            <td><b>{p.nome}</b><div className="mudo">{p.email}</div></td>
            <td>{p.papel === 'admin' ? 'Administrador' : 'Responsável'} {p.status !== 'ativo' && <span className="tag vermelho">inativo</span>}</td>
            <td>{p.grupos.map((g) => <span key={g.id} className="tag">{g.nome}</span>)}</td>
            <td>{fmtDataHora(p.ultimo_acesso)}</td>
            <td className="acoes">
              <button className="sec" onClick={() => setEd({ ...p, telefone: p.telefone || '', grupos: p.grupos.map((g) => g.id) })}>Editar</button>
              <button className="sec" onClick={() => novaSenha(p)}>Nova senha</button>
              <button className="perigo" onClick={() => excluir(p)}>Excluir</button>
            </td>
          </tr>
        ))}
      </tbody></table>
      {ed && (
        <Modal fechar={() => setEd(null)}>
          <h2 style={{ marginTop: 0 }}>{ed.id ? 'Editar' : 'Cadastrar'} membro da equipe</h2>
          <div className="linha">
            <div><label>Nome completo</label><input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></div>
            <div><label>E-mail</label><input type="email" value={ed.email} onChange={(e) => setEd({ ...ed, email: e.target.value })} /></div>
            <div><label>Telefone</label><input value={ed.telefone} onChange={(e) => setEd({ ...ed, telefone: e.target.value })} /></div>
            <div><label>Função</label><select value={ed.papel} onChange={(e) => setEd({ ...ed, papel: e.target.value })}><option value="responsavel">Responsável vocacional</option><option value="admin">Administrador</option></select></div>
            {ed.id && <div><label>Situação</label><select value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value })}><option value="ativo">Ativo</option><option value="inativo">Inativo (sem acesso)</option></select></div>}
          </div>
          <label>Grupos que acompanha</label>
          <div>{(grupos || []).map((g) => <label key={g.id} className="check"><input type="checkbox" checked={ed.grupos.includes(g.id)} onChange={() => alternar(g.id)} /> {g.nome}</label>)}
            {grupos && !grupos.length && <span className="mudo">Crie grupos primeiro em "Grupos".</span>}</div>
          {msg && <div className="erro">{msg}</div>}
          <div className="acoes"><button onClick={salvar}>Salvar</button><button className="sec" onClick={() => setEd(null)}>Cancelar</button></div>
        </Modal>
      )}
    </>
  );
}
