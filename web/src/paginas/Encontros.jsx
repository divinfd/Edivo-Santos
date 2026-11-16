import React, { useState } from 'react';
import { api } from '../api.js';
import { useCarregar, useSessao, Modal } from '../App.jsx';

const DURACOES = [[30, '30 minutos'], [45, '45 minutos'], [60, '1 hora'], [90, '1h30'], [120, '2 horas'], [180, '3 horas']];
const SITUACAO = { agendado: ['Agendado', ''], aberto: ['Sala aberta', 'verde'], encerrado: ['Encerrado', 'cinza'] };

function amanhaAs(h) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:00`;
}

export default function Encontros() {
  const { admin, usuario } = useSessao();
  const [d, erro, recarregar] = useCarregar(() => api('/painel/encontros'));
  const [grupos] = useCarregar(() => api('/painel/grupos'));
  const [novo, setNovo] = useState(null);
  const [msg, setMsg] = useState('');
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setMsg('');
    setNovo({ titulo: '', descricao: '', inicio: amanhaAs(19), duracao_min: 60, para_todos: admin, grupos: [], notificar: true });
  }
  const alternar = (id) => setNovo({ ...novo, grupos: novo.grupos.includes(id) ? novo.grupos.filter((x) => x !== id) : [...novo.grupos, id] });

  async function salvar() {
    setMsg(''); setSalvando(true);
    try {
      await api('/painel/encontros', { metodo: 'POST', corpo: { ...novo, inicio: new Date(novo.inicio).toISOString(), duracao_min: Number(novo.duracao_min) } });
      setNovo(null); recarregar();
    } catch (e) { setMsg(e.message); }
    setSalvando(false);
  }
  async function excluir(e) {
    if (!confirm(`Excluir o encontro "${e.titulo}"? A sala de vídeo também será apagada.`)) return;
    try { await api('/painel/encontros/' + e.id, { metodo: 'DELETE' }); recarregar(); } catch (err) { alert(err.message); }
  }
  async function entrar(e) {
    const janela = window.open('', '_blank');
    try {
      const r = await api(`/painel/encontros/${e.id}/entrar`, { metodo: 'POST', corpo: {} });
      janela.location.href = `${r.url}?t=${encodeURIComponent(r.token)}`;
    } catch (err) { janela?.close(); alert(err.message); }
  }

  const nomesGrupos = (ids) => ids.map((id) => (grupos || []).find((g) => g.id === id)?.nome || `#${id}`).join(', ');
  const lista = d?.lista || [];
  return (
    <>
      <h1>Encontros por vídeo</h1>
      <p className="mudo">Crie um encontro e os jovens dos grupos escolhidos entram na chamada de vídeo direto pelo aplicativo. A sala abre 30 minutos antes do horário e fecha 30 minutos depois do fim. A equipe entra por aqui como moderadora (pode silenciar ou remover participantes).</p>
      {d && !d.configurado && <div className="aviso">As chamadas de vídeo ainda não foram configuradas no servidor.</div>}
      <div className="acoes"><button onClick={abrirNovo} disabled={d && !d.configurado}>Novo encontro</button></div>
      {erro && <div className="erro">{erro}</div>}
      <table><thead><tr><th>Encontro</th><th>Quando</th><th>Para</th><th>Situação</th><th></th></tr></thead><tbody>
        {lista.map((e) => {
          const [rotulo, cor] = SITUACAO[e.situacao];
          return (
            <tr key={e.id}>
              <td><b>{e.titulo}</b>{e.descricao && <div className="mudo">{e.descricao}</div>}</td>
              <td>{new Date(e.inicio).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}<div className="mudo">{e.duracao_min} min</div></td>
              <td>{e.para_todos ? 'Todos os jovens' : nomesGrupos(e.grupos)}</td>
              <td><span className={'tag ' + cor}>{rotulo}</span></td>
              <td className="acoes">
                {e.situacao !== 'encerrado' && <button onClick={() => entrar(e)}>Entrar na sala</button>}
                {(admin || e.criado_por === usuario.id) && <button className="perigo" onClick={() => excluir(e)}>Excluir</button>}
              </td>
            </tr>
          );
        })}
      </tbody></table>
      {d && !lista.length && <p className="mudo">Nenhum encontro agendado.</p>}
      {novo && (
        <Modal fechar={() => setNovo(null)}>
          <h2 style={{ marginTop: 0 }}>Novo encontro por vídeo</h2>
          <label>Título</label><input maxLength={150} value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} placeholder="Ex.: Encuentro vocacional" />
          <label>Descrição (opcional)</label><textarea maxLength={1000} value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          <label>Dia e hora (horário deste computador)</label><input type="datetime-local" value={novo.inicio} onChange={(e) => setNovo({ ...novo, inicio: e.target.value })} />
          <label>Duração</label>
          <select value={novo.duracao_min} onChange={(e) => setNovo({ ...novo, duracao_min: e.target.value })} style={{ maxWidth: 200 }}>
            {DURACOES.map(([m, t]) => <option key={m} value={m}>{t}</option>)}
          </select>
          <label>Quem participa</label>
          {admin && <label className="check"><input type="checkbox" checked={novo.para_todos} onChange={(e) => setNovo({ ...novo, para_todos: e.target.checked })} /> Todos os jovens</label>}
          {!novo.para_todos && <div>{(grupos || []).map((g) => <label key={g.id} className="check"><input type="checkbox" checked={novo.grupos.includes(g.id)} onChange={() => alternar(g.id)} /> {g.nome}</label>)}</div>}
          <label className="check"><input type="checkbox" checked={novo.notificar} onChange={(e) => setNovo({ ...novo, notificar: e.target.checked })} /> Avisar os jovens agora por notificação</label>
          <p className="mudo">Todos recebem também um lembrete quando a sala abrir.</p>
          {msg && <div className="erro">{msg}</div>}
          <div className="acoes"><button onClick={salvar} disabled={salvando || !novo.titulo.trim()}>{salvando ? 'Criando sala...' : 'Criar encontro'}</button><button className="sec" onClick={() => setNovo(null)}>Cancelar</button></div>
        </Modal>
      )}
    </>
  );
}
