import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, fmtData, fmtDataHora, TIPOS_MENSAGEM } from '../api.js';
import { useCarregar, useSessao, Modal } from '../App.jsx';

const STATUS = { ativo: ['Ativo', 'verde'], pendente: ['Aguardando aprovação', 'ouro'], inativo: ['Inativo', 'cinza'] };
const idade = (d) => {
  if (!d) return null;
  const n = new Date(d + 'T12:00:00'), h = new Date();
  let i = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) i--;
  return i;
};
const vazio = { nome: '', email: '', telefone: '', data_nascimento: '', responsavel_legal_nome: '', responsavel_legal_contato: '', consentimento_confirmado: false, grupos: [], status: 'ativo' };

function FormJovem({ inicial, grupos, fechar, salvo }) {
  const [f, setF] = useState(inicial);
  const [msg, setMsg] = useState('');
  const menor = idade(f.data_nascimento) !== null && idade(f.data_nascimento) < 18;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function salvar() {
    setMsg('');
    try {
      if (f.id) { await api('/painel/jovens/' + f.id, { metodo: 'PUT', corpo: f }); salvo(); }
      else salvo(await api('/painel/jovens', { metodo: 'POST', corpo: f }));
    } catch (e) { setMsg(e.message); }
  }
  return (
    <Modal fechar={fechar}>
      <h2 style={{ marginTop: 0 }}>{f.id ? 'Editar jovem' : 'Cadastrar jovem'}</h2>
      <div className="linha">
        <div><label>Nome completo</label><input value={f.nome} onChange={set('nome')} /></div>
        <div><label>E-mail (usado para entrar no app)</label><input type="email" value={f.email} onChange={set('email')} /></div>
        <div><label>Telefone</label><input value={f.telefone || ''} onChange={set('telefone')} /></div>
        <div><label>Data de nascimento</label><input type="date" value={f.data_nascimento || ''} onChange={set('data_nascimento')} /></div>
        {f.id && <div><label>Situação</label><select value={f.status} onChange={set('status')}><option value="ativo">Ativo</option><option value="pendente">Aguardando aprovação</option><option value="inativo">Inativo (sem acesso)</option></select></div>}
      </div>
      {menor && (
        <div className="cartao" style={{ background: '#fffdf5', marginTop: 12 }}>
          <b>Menor de idade</b> – é necessário o consentimento do pai, mãe ou responsável legal.
          <div className="linha">
            <div><label>Nome do responsável legal</label><input value={f.responsavel_legal_nome || ''} onChange={set('responsavel_legal_nome')} /></div>
            <div><label>Telefone ou e-mail do responsável legal</label><input value={f.responsavel_legal_contato || ''} onChange={set('responsavel_legal_contato')} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={!!f.consentimento_confirmado} onChange={set('consentimento_confirmado')} /> Confirmo que recebemos a autorização do responsável legal</label>
        </div>
      )}
      <label>Grupos</label>
      <div>{grupos.map((g) => <label key={g.id} className="check"><input type="checkbox" checked={f.grupos.includes(g.id)} onChange={() => setF({ ...f, grupos: f.grupos.includes(g.id) ? f.grupos.filter((x) => x !== g.id) : [...f.grupos, g.id] })} /> {g.nome}</label>)}
        {!grupos.length && <span className="mudo">Nenhum grupo criado.</span>}</div>
      {!f.id && <p className="mudo">Uma senha temporária será gerada para você entregar ao jovem.</p>}
      {msg && <div className="erro">{msg}</div>}
      <div className="acoes"><button onClick={salvar}>Salvar</button><button className="sec" onClick={fechar}>Cancelar</button></div>
    </Modal>
  );
}

export default function Jovens() {
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('');
  const [status, setStatus] = useState('');
  const [lista, erro, recarregar] = useCarregar(() => api(`/painel/jovens?busca=${encodeURIComponent(busca)}&grupo=${grupo}&status=${status}`), [busca, grupo, status]);
  const [grupos] = useCarregar(() => api('/painel/grupos'));
  const [novo, setNovo] = useState(false);
  const [criado, setCriado] = useState(null);
  const nav = useNavigate();
  return (
    <>
      <h1>Jovens</h1>
      <div className="filtros">
        <input placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)}><option value="">Todos os grupos</option>{(grupos || []).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas as situações</option><option value="pendente">Aguardando aprovação</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option></select>
        <button onClick={() => setNovo(true)}>Cadastrar jovem</button>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {criado && <div className="ok">Jovem cadastrado. Senha temporária: <b style={{ fontFamily: 'monospace', fontSize: 16 }}>{criado.senha_inicial}</b> — entregue ao jovem; ele poderá trocá-la no app. <button className="link" onClick={() => nav('/painel/jovens/' + criado.id)}>Abrir ficha</button></div>}
      <table><thead><tr><th>Nome</th><th>Idade</th><th>Grupos</th><th>Situação</th><th>Respostas</th><th>Último acesso</th></tr></thead><tbody>
        {(lista || []).map((j) => (
          <tr key={j.id} className="clicavel" onClick={() => nav('/painel/jovens/' + j.id)}>
            <td><b>{j.nome}</b><div className="mudo">{j.email}</div></td>
            <td>{idade(j.data_nascimento) ?? '—'}{idade(j.data_nascimento) < 18 && (j.consentimento_confirmado_em ? <span className="tag verde">autorizado</span> : <span className="tag vermelho">sem autorização confirmada</span>)}</td>
            <td>{j.grupos.map((g) => <span key={g.id} className="tag">{g.nome}</span>)}</td>
            <td><span className={'tag ' + STATUS[j.status][1]}>{STATUS[j.status][0]}</span>{j.exclusao_solicitada_em && <span className="tag vermelho">pediu exclusão</span>}</td>
            <td>{j.respostas}</td>
            <td>{fmtDataHora(j.ultimo_acesso)}</td>
          </tr>
        ))}
        {lista && !lista.length && <tr><td colSpan={6} className="mudo">Nenhum jovem encontrado.</td></tr>}
      </tbody></table>
      {novo && <FormJovem inicial={vazio} grupos={grupos || []} fechar={() => setNovo(false)} salvo={(r) => { setNovo(false); setCriado(r); recarregar(); }} />}
    </>
  );
}

export function JovemDetalhe() {
  const { id } = useParams();
  const { admin } = useSessao();
  const nav = useNavigate();
  const [j, erro, recarregar] = useCarregar(() => api('/painel/jovens/' + id), [id]);
  const [grupos] = useCarregar(() => api('/painel/grupos'));
  const [editar, setEditar] = useState(false);
  const [obs, setObs] = useState('');
  const [senha, setSenha] = useState('');
  if (erro) return <div className="erro">{erro}</div>;
  if (!j) return <p>Carregando...</p>;
  const i = idade(j.data_nascimento);
  async function aprovar() { await api('/painel/jovens/' + id, { metodo: 'PUT', corpo: { ...j, grupos: j.grupos.map((g) => g.id), status: 'ativo' } }); recarregar(); }
  async function novaSenha() {
    if (!confirm('Gerar uma senha temporária nova? A senha atual deixará de funcionar.')) return;
    setSenha((await api(`/painel/jovens/${id}/senha`, { metodo: 'POST', corpo: {} })).senha_temporaria);
  }
  async function excluir() {
    if (!confirm(`Excluir DEFINITIVAMENTE a conta de ${j.nome} e todas as suas respostas? Esta ação não pode ser desfeita.`)) return;
    try { await api('/painel/jovens/' + id, { metodo: 'DELETE' }); nav('/painel/jovens'); } catch (e) { alert(e.message); }
  }
  async function salvarObs() {
    if (!obs.trim()) return;
    await api(`/painel/jovens/${id}/observacoes`, { metodo: 'POST', corpo: { texto: obs } });
    setObs('');
    recarregar();
  }
  return (
    <>
      <p><Link to="/painel/jovens">← Jovens</Link></p>
      <h1>{j.nome} <span className={'tag ' + STATUS[j.status][1]}>{STATUS[j.status][0]}</span></h1>
      {j.exclusao_solicitada_em && <div className="aviso">O jovem pediu a exclusão da conta em {fmtDataHora(j.exclusao_solicitada_em)}. {admin ? 'Use o botão "Excluir conta" para atender ao pedido.' : 'Avise um administrador.'}</div>}
      {i !== null && i < 18 && !j.consentimento_confirmado_em && <div className="aviso">Menor de idade sem autorização do responsável legal confirmada. Confira a autorização e marque-a em "Editar dados".</div>}
      {senha && <div className="ok">Nova senha temporária: <b style={{ fontFamily: 'monospace', fontSize: 16 }}>{senha}</b> — entregue ao jovem pessoalmente ou por um canal seguro.</div>}
      <div className="cartao">
        <div className="linha">
          <div><label>E-mail</label>{j.email}</div>
          <div><label>Telefone</label>{j.telefone || '—'}</div>
          <div><label>Nascimento</label>{fmtData(j.data_nascimento && j.data_nascimento + 'T12:00:00')} {i !== null && `(${i} anos)`}</div>
          <div><label>Grupos</label>{j.grupos.map((g) => <span key={g.id} className="tag">{g.nome}</span>)}{!j.grupos.length && '—'}</div>
          <div><label>Cadastro</label>{fmtDataHora(j.criado_em)}</div>
          <div><label>Último acesso</label>{fmtDataHora(j.ultimo_acesso)}</div>
          {j.responsavel_legal_nome && <div><label>Responsável legal</label>{j.responsavel_legal_nome}<div className="mudo">{j.responsavel_legal_contato}</div></div>}
          {(j.consentimento_declarado_em || j.consentimento_confirmado_em) && <div><label>Consentimento</label>
            {j.consentimento_declarado_em && <div className="mudo">Declarado no app: {fmtDataHora(j.consentimento_declarado_em)}</div>}
            {j.consentimento_confirmado_em && <div className="mudo">Confirmado pela equipe: {fmtDataHora(j.consentimento_confirmado_em)}</div>}</div>}
        </div>
        <div className="acoes" style={{ marginTop: 16 }}>
          {j.status === 'pendente' && <button className="ouro" onClick={aprovar}>Aprovar cadastro</button>}
          <button className="sec" onClick={() => setEditar(true)}>Editar dados</button>
          <button className="sec" onClick={novaSenha}>Gerar nova senha</button>
          {admin && <button className="perigo" onClick={excluir}>Excluir conta</button>}
        </div>
      </div>
      <h2>Atividades e respostas</h2>
      <table><thead><tr><th>Atividade</th><th>Publicada</th><th>Progresso</th><th>Feedback</th></tr></thead><tbody>
        {j.atividades.map((a) => (
          <tr key={a.id}>
            <td><b>{a.titulo}</b><div className="mudo">{a.categoria}</div></td>
            <td>{fmtData(a.publicar_em)}{a.prazo && <div className="mudo">prazo {fmtData(a.prazo + 'T12:00:00')}</div>}</td>
            <td>{a.progresso === 'concluida' ? <span className="tag verde">Concluída {fmtData(a.concluida_em)}</span> : a.progresso === 'iniciada' ? <span className="tag ouro">Iniciada {fmtData(a.iniciada_em)}</span> : <span className="tag cinza">Não iniciada</span>}</td>
            <td>{a.resposta_id ? <Link to={`/painel/respostas?abrir=${a.resposta_id}`}>Ver resposta ({fmtData(a.enviada_em)})</Link> : '—'}</td>
          </tr>
        ))}
        {!j.atividades.length && <tr><td colSpan={4} className="mudo">Nenhuma atividade disponível para este jovem.</td></tr>}
      </tbody></table>
      <h2>Observações privadas da equipe</h2>
      <p className="mudo">Visíveis apenas para a equipe. O jovem nunca vê estas anotações.</p>
      <div className="cartao">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Escreva uma observação sobre o acompanhamento..." />
        <div className="acoes"><button onClick={salvarObs} disabled={!obs.trim()}>Salvar observação</button></div>
        {j.observacoes.map((o) => (
          <div key={o.id} className="pergunta"><div className="pre">{o.texto}</div><div className="mudo">{o.autor} · {fmtDataHora(o.criado_em)} <button className="link" onClick={async () => { if (confirm('Apagar esta observação?')) { try { await api('/painel/observacoes/' + o.id, { metodo: 'DELETE' }); recarregar(); } catch (e) { alert(e.message); } } }}>apagar</button></div></div>
        ))}
      </div>
      {j.mensagens.length > 0 && (<>
        <h2>Mensagens enviadas pelo jovem</h2>
        {j.mensagens.map((m) => <div key={m.id} className="cartao"><span className="tag">{TIPOS_MENSAGEM[m.tipo] || m.tipo}</span> <span className="mudo">{fmtDataHora(m.criado_em)}</span><p className="pre">{m.texto}</p>{m.resposta ? <div className="ok pre">Resposta: {m.resposta}</div> : <Link to="/painel/mensagens">Responder</Link>}</div>)}
      </>)}
      {editar && <FormJovem inicial={{ ...vazio, ...j, consentimento_confirmado: !!j.consentimento_confirmado_em, grupos: j.grupos.map((g) => g.id) }} grupos={grupos || []} fechar={() => setEditar(false)} salvo={() => { setEditar(false); recarregar(); }} />}
    </>
  );
}
