import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, enviarPdf, baixarPdf, enviarImagem, imagemUrl, fmtData, fmtDataHora, TIPOS_PERGUNTA } from '../api.js';
import { useCarregar, useSessao } from '../App.jsx';

const ST = { rascunho: ['Rascunho', 'cinza'], publicada: ['Publicada', 'verde'], arquivada: ['Arquivada', 'ouro'] };
const local = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

export default function Atividades() {
  const [status, setStatus] = useState('');
  const [lista, erro] = useCarregar(() => api('/painel/atividades?status=' + status), [status]);
  const nav = useNavigate();
  return (
    <>
      <h1>Orações e materiais</h1>
      <div className="filtros">
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas</option><option value="publicada">Publicadas</option><option value="rascunho">Rascunhos</option><option value="arquivada">Arquivadas</option></select>
        <button onClick={() => nav('/painel/atividades/nova')}>Nova oração / atividade</button>
      </div>
      {erro && <div className="erro">{erro}</div>}
      <table><thead><tr><th></th><th>Título</th><th>Situação</th><th>Destinatários</th><th>Concluídas</th><th>Respostas</th></tr></thead><tbody>
        {(lista || []).map((a) => (
          <tr key={a.id} className="clicavel" onClick={() => nav('/painel/atividades/' + a.id)}>
            <td style={{ width: 56 }}>{a.capa_key && <img src={imagemUrl(a.capa_key)} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />}</td>
            <td><b>{a.titulo}</b><div className="mudo">{a.categoria}{a.arquivo_nome && ' · PDF'}{a.perguntas > 0 && ` · ${a.perguntas} pergunta(s)`}</div></td>
            <td><span className={'tag ' + ST[a.status][1]}>{ST[a.status][0]}</span>{a.status === 'publicada' && new Date(a.publicar_em) > new Date() && <div className="mudo">aparece em {fmtDataHora(a.publicar_em)}</div>}{a.prazo && <div className="mudo">prazo {fmtData(a.prazo + 'T12:00:00')}</div>}</td>
            <td>{a.para_todos ? 'Todos os jovens' : a.grupos.join(', ')}<div className="mudo">{a.destinatarios} jovem(ns)</div></td>
            <td>{a.concluidas}</td><td>{a.respostas}</td>
          </tr>
        ))}
        {lista && !lista.length && <tr><td colSpan={6} className="mudo">Nenhuma atividade.</td></tr>}
      </tbody></table>
    </>
  );
}

function EditorPergunta({ p, i, total, mudar, remover, mover }) {
  const set = (k, v) => mudar({ ...p, [k]: v });
  return (
    <div className="pergunta">
      <div className="acoes" style={{ justifyContent: 'space-between', margin: 0 }}>
        <b>Pergunta {i + 1}</b>
        <span className="acoes" style={{ margin: 0 }}>
          <button className="sec" disabled={i === 0} onClick={() => mover(-1)}>↑</button>
          <button className="sec" disabled={i === total - 1} onClick={() => mover(1)}>↓</button>
          <button className="perigo" disabled={p.respostas > 0} title={p.respostas > 0 ? 'Já tem respostas' : ''} onClick={remover}>Remover</button>
        </span>
      </div>
      <label>Texto da pergunta</label><input value={p.texto} onChange={(e) => set('texto', e.target.value)} />
      <div className="linha">
        <div><label>Tipo de resposta</label><select value={p.tipo} disabled={p.respostas > 0} onChange={(e) => mudar({ ...p, tipo: e.target.value, opcoes: e.target.value === 'escala' ? [1, 5] : e.target.value === 'multipla' ? ['', ''] : [] })}>
          {Object.entries(TIPOS_PERGUNTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label>&nbsp;</label><label className="check"><input type="checkbox" checked={p.obrigatoria} onChange={(e) => set('obrigatoria', e.target.checked)} /> Resposta obrigatória</label></div>
      </div>
      {p.tipo === 'multipla' && (<>
        <label>Opções</label>
        {p.opcoes.map((o, k) => (
          <div key={k} className="acoes" style={{ margin: '4px 0' }}>
            <input value={o} onChange={(e) => set('opcoes', p.opcoes.map((x, z) => (z === k ? e.target.value : x)))} placeholder={`Opção ${k + 1}`} />
            <button className="sec" onClick={() => set('opcoes', p.opcoes.filter((_, z) => z !== k))} disabled={p.opcoes.length <= 2}>×</button>
          </div>
        ))}
        <button className="sec" onClick={() => set('opcoes', [...p.opcoes, ''])}>+ opção</button>
      </>)}
      {p.tipo === 'escala' && (
        <div className="linha">
          <div><label>De</label><input type="number" value={p.opcoes[0]} onChange={(e) => set('opcoes', [Number(e.target.value), p.opcoes[1]])} /></div>
          <div><label>Até</label><input type="number" value={p.opcoes[1]} onChange={(e) => set('opcoes', [p.opcoes[0], Number(e.target.value)])} /></div>
        </div>
      )}
    </div>
  );
}

export function AtividadeEditor() {
  const { id } = useParams();
  const nova = id === 'nova';
  const { admin } = useSessao();
  const nav = useNavigate();
  const [status] = useCarregar(() => api('/painel/status'));
  const [grupos] = useCarregar(() => api('/painel/grupos'));
  const [a, setA] = useState(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [prog, setProg] = useState(null);
  const [pendentes, setPendentes] = useState(null);
  const [notificar, setNotificar] = useState(true);
  useEffect(() => {
    if (nova) setA({ titulo: '', descricao: '', categoria: '', capa_key: '', arquivo_id: null, publicar_em: new Date().toISOString(), prazo: '', permitir_download: false, permitir_offline: true, para_todos: admin, grupos: [], perguntas: [], status: 'rascunho' });
    else api('/painel/atividades/' + id).then((x) => setA({ ...x, prazo: x.prazo ? String(x.prazo).slice(0, 10) : '' })).catch((e) => setMsg(e.message));
  }, [id]);
  if (!a) return msg ? <div className="erro">{msg}</div> : <p>Carregando...</p>;
  const set = (k, v) => setA({ ...a, [k]: v });
  const categorias = status?.categorias || [];

  async function salvar() {
    setMsg(''); setOk('');
    try {
      const corpo = { ...a, categoria: a.categoria || categorias[0] };
      const r = nova ? await api('/painel/atividades', { metodo: 'POST', corpo }) : await api('/painel/atividades/' + id, { metodo: 'PUT', corpo });
      setA({ ...r, prazo: r.prazo ? String(r.prazo).slice(0, 10) : '' });
      setOk('Salvo.');
      if (nova) nav('/painel/atividades/' + r.id, { replace: true });
      return r;
    } catch (e) { setMsg(e.message); return null; }
  }
  async function acao(tipo) {
    const r = await salvar();
    if (!r) return;
    try {
      const x = await api(`/painel/atividades/${r.id}/${tipo}`, { metodo: 'POST', corpo: { notificar } });
      const lida = await api('/painel/atividades/' + r.id);
      setA({ ...lida, prazo: lida.prazo ? String(lida.prazo).slice(0, 10) : '' });
      setOk(tipo === 'publicar' ? (x.agendada ? 'Publicação agendada.' : 'Publicada! Os jovens já podem ver.') + (x.push ? ` Notificação enviada para ${x.push.entregues} aparelho(s).` : '') : tipo === 'arquivar' ? 'Atividade arquivada.' : 'Voltou para rascunho.');
    } catch (e) { setMsg(e.message); }
  }
  async function excluir() {
    if (!confirm('Excluir esta atividade?')) return;
    try { await api('/painel/atividades/' + id, { metodo: 'DELETE' }); nav('/painel/atividades'); } catch (e) { setMsg(e.message); }
  }
  async function escolherPdf(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setMsg(''); setProg(0);
    try { const r = await enviarPdf(f, setProg); setA((x) => ({ ...x, arquivo_id: r.id, arquivo_nome: r.nome, arquivo_tamanho: r.tamanho, arquivo_partes: r.partes })); }
    catch (er) { setMsg('Falha ao enviar o PDF: ' + er.message); }
    setProg(null);
  }
  async function escolherCapa(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { set('capa_key', await enviarImagem(f)); } catch (er) { setMsg('Falha ao enviar a imagem: ' + er.message); }
  }
  async function verPdf() {
    const b = await baixarPdf(a.arquivo_id, a.arquivo_partes);
    window.open(URL.createObjectURL(b), '_blank');
  }
  const perguntas = a.perguntas || [];
  const setP = (lista) => set('perguntas', lista);
  return (
    <>
      <p><Link to="/painel/atividades">← Orações e materiais</Link></p>
      <h1>{nova ? 'Nova oração / atividade' : a.titulo} {!nova && <span className={'tag ' + ST[a.status][1]}>{ST[a.status][0]}</span>}</h1>
      <div className="cartao">
        <label>Título</label><input value={a.titulo} onChange={(e) => set('titulo', e.target.value)} />
        <label>Apresentação / orientações para o jovem</label><textarea value={a.descricao || ''} onChange={(e) => set('descricao', e.target.value)} />
        <div className="linha">
          <div><label>Categoria</label><select value={a.categoria || categorias[0] || ''} onChange={(e) => set('categoria', e.target.value)}>{categorias.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label>Publicar a partir de</label><input type="datetime-local" value={local(a.publicar_em)} onChange={(e) => { const d = new Date(e.target.value); if (!isNaN(d)) set('publicar_em', d.toISOString()); }} /></div>
          <div><label>Prazo (opcional)</label><input type="date" value={a.prazo || ''} onChange={(e) => set('prazo', e.target.value)} /></div>
        </div>
        <div className="linha">
          <div>
            <label>Material em PDF</label>
            {a.arquivo_id ? <div>{a.arquivo_nome} <span className="mudo">({(a.arquivo_tamanho / 1048576).toFixed(1)} MB)</span> <button className="link" onClick={verPdf}>abrir</button> · <button className="link" onClick={() => set('arquivo_id', null)}>remover</button></div> : <span className="mudo">Nenhum PDF</span>}
            <div style={{ marginTop: 6 }}><input type="file" accept="application/pdf" onChange={escolherPdf} disabled={prog !== null} /></div>
            {prog !== null && <div className="mudo">Enviando... {prog}%</div>}
            <label className="check"><input type="checkbox" checked={a.permitir_offline} onChange={(e) => set('permitir_offline', e.target.checked)} /> Permitir leitura sem internet no app</label>
            <label className="check"><input type="checkbox" checked={a.permitir_download} onChange={(e) => set('permitir_download', e.target.checked)} /> Permitir que o jovem salve/compartilhe o PDF</label>
          </div>
          <div>
            <label>Imagem de capa (opcional)</label>
            {a.capa_key && <div><img src={imagemUrl(a.capa_key)} alt="" style={{ maxWidth: 200, borderRadius: 8 }} /><br /><button className="link" onClick={() => set('capa_key', '')}>remover</button></div>}
            <input type="file" accept="image/*" onChange={escolherCapa} />
          </div>
        </div>
        <label>Destinatários</label>
        {admin && <label className="check"><input type="checkbox" checked={a.para_todos} onChange={(e) => set('para_todos', e.target.checked)} /> Todos os jovens</label>}
        {!a.para_todos && <div>{(grupos || []).map((g) => <label key={g.id} className="check"><input type="checkbox" checked={a.grupos.includes(g.id)} onChange={() => set('grupos', a.grupos.includes(g.id) ? a.grupos.filter((x) => x !== g.id) : [...a.grupos, g.id])} /> {g.nome} <span className="mudo">({g.membros.length} jovens)</span></label>)}</div>}
      </div>
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Perguntas de feedback</h2>
        <p className="mudo">O jovem responde depois da oração. Somente a equipe vê as respostas; nenhum outro jovem tem acesso.</p>
        {perguntas.map((p, i) => (
          <EditorPergunta key={p.id || 'n' + i} p={p} i={i} total={perguntas.length}
            mudar={(np) => setP(perguntas.map((x, k) => (k === i ? np : x)))}
            remover={() => setP(perguntas.filter((_, k) => k !== i))}
            mover={(d) => { const l = [...perguntas]; [l[i], l[i + d]] = [l[i + d], l[i]]; setP(l); }} />
        ))}
        <button className="sec" onClick={() => setP([...perguntas, { texto: '', tipo: 'texto_longo', opcoes: [], obrigatoria: true }])}>+ Adicionar pergunta</button>
      </div>
      {msg && <div className="erro">{msg}</div>}
      {ok && <div className="ok">{ok}</div>}
      <div className="cartao acoes">
        <button className="sec" onClick={salvar}>Salvar</button>
        {a.status !== 'publicada' && <><button className="ouro" onClick={() => acao('publicar')}>Salvar e publicar</button>
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} /> avisar os jovens por notificação</label></>}
        {a.status === 'publicada' && <button className="sec" onClick={() => acao('rascunho')}>Despublicar</button>}
        {a.status !== 'arquivada' && !nova && <button className="sec" onClick={() => acao('arquivar')}>Arquivar</button>}
        {!nova && <button className="perigo" onClick={excluir}>Excluir</button>}
        {!nova && a.status === 'publicada' && <button className="sec" onClick={() => api(`/painel/atividades/${id}/pendentes`).then(setPendentes)}>Quem ainda não respondeu?</button>}
      </div>
      {pendentes && <div className="cartao"><h2 style={{ marginTop: 0 }}>Ainda sem feedback ({pendentes.length})</h2>
        {pendentes.map((p) => <div key={p.id}><Link to={'/painel/jovens/' + p.id}>{p.nome}</Link> <span className="mudo">{p.progresso === 'concluida' ? 'concluiu a oração' : p.progresso === 'iniciada' ? 'iniciou' : 'não abriu'}</span></div>)}
        {!pendentes.length && <span className="mudo">Todos responderam.</span>}</div>}
      {!nova && <p className="mudo">Criada por {a.criado_por_nome} em {fmtDataHora(a.criado_em)}{a.atualizado_em && ` · atualizada em ${fmtDataHora(a.atualizado_em)}`}{a.notificado_em && ` · notificação enviada em ${fmtDataHora(a.notificado_em)}`}</p>}
    </>
  );
}
