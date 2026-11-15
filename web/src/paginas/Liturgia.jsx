import React, { useState, useEffect } from 'react';
import { api, fmtDataHora } from '../api.js';
import { useCarregar, useSessao } from '../App.jsx';

const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const PARTES = [['primeira_leitura', 'Primeira leitura'], ['salmo', 'Salmo'], ['segunda_leitura', 'Segunda leitura'], ['evangelho', 'Evangelho']];

function Leitura({ l, mudar, remover, salmo }) {
  return (
    <div className="pergunta">
      <div className="linha">
        <div><label>Referência</label><input value={l.referencia || ''} onChange={(e) => mudar({ ...l, referencia: e.target.value })} /></div>
        {salmo ? <div><label>Refrão</label><input value={l.refrao || ''} onChange={(e) => mudar({ ...l, refrao: e.target.value })} /></div>
          : <div><label>Título</label><input value={l.titulo || ''} onChange={(e) => mudar({ ...l, titulo: e.target.value })} /></div>}
      </div>
      <label>Texto</label><textarea style={{ minHeight: 140 }} value={l.texto || ''} onChange={(e) => mudar({ ...l, texto: e.target.value })} />
      <button className="link" onClick={remover}>remover</button>
    </div>
  );
}

export default function Liturgia() {
  const { admin } = useSessao();
  const [data, setData] = useState(hoje());
  const [l, setL] = useState(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [hist, , recarregarHist] = useCarregar(() => api('/painel/liturgia-historico'));
  const carregar = () => { setL(null); setMsg(''); api('/painel/liturgia?data=' + data).then(setL).catch((e) => setMsg(e.message)); };
  useEffect(carregar, [data]);
  async function salvar() {
    setMsg(''); setOk('');
    try { await api('/painel/liturgia/' + data, { metodo: 'PUT', corpo: l }); setOk('Liturgia salva com correção manual. É esta versão que os jovens verão.'); carregar(); recarregarHist(); } catch (e) { setMsg(e.message); }
  }
  async function recarregar() {
    if (!confirm('Buscar novamente na fonte oficial? Correções manuais deste dia serão substituídas.')) return;
    setMsg(''); setOk('');
    try { setL(await api(`/painel/liturgia/${data}/recarregar`, { metodo: 'POST', corpo: {} })); setOk('Liturgia atualizada a partir da fonte.'); recarregarHist(); } catch (e) { setMsg(e.message); }
  }
  const set = (k, v) => setL({ ...l, [k]: v });
  return (
    <>
      <h1>Liturgia diária</h1>
      <p className="mudo">A liturgia é buscada automaticamente na fonte configurada em "Configurações". Aqui você pode conferir, corrigir e acrescentar uma reflexão ou o santo do dia.</p>
      <div className="filtros"><input type="date" value={data} onChange={(e) => setData(e.target.value)} />{admin && <button className="sec" onClick={recarregar}>Buscar novamente na fonte</button>}</div>
      {msg && <div className="erro">{msg}</div>}{ok && <div className="ok">{ok}</div>}
      {!l ? !msg && <p>Carregando...</p> : (
        <div className="cartao">
          {l.indisponivel && <div className="aviso">A fonte não trouxe a liturgia deste dia. {admin && 'Você pode preenchê-la manualmente abaixo.'}</div>}
          <p className="mudo">{l.manual ? 'Versão corrigida manualmente' : `Fonte: ${l.fonte || '—'}`}</p>
          <div className="linha">
            <div><label>Título do dia</label><input disabled={!admin} value={l.titulo || ''} onChange={(e) => set('titulo', e.target.value)} /></div>
            <div><label>Tempo litúrgico</label><input disabled={!admin} value={l.tempo || ''} onChange={(e) => set('tempo', e.target.value)} /></div>
            <div><label>Cor litúrgica</label><input disabled={!admin} value={l.cor || ''} onChange={(e) => set('cor', e.target.value)} /></div>
          </div>
          {PARTES.map(([k, nome]) => (
            <div key={k}>
              <h2>{nome}</h2>
              {(l[k] || []).map((x, i) => <Leitura key={i} l={x} salmo={k === 'salmo'} mudar={(n) => admin && set(k, l[k].map((y, z) => (z === i ? n : y)))} remover={() => admin && set(k, l[k].filter((_, z) => z !== i))} />)}
              {admin && <button className="sec" onClick={() => set(k, [...(l[k] || []), { referencia: '', titulo: '', refrao: '', texto: '' }])}>+ {nome}</button>}
            </div>
          ))}
          <h2>Reflexão</h2><textarea disabled={!admin} value={l.reflexao || ''} onChange={(e) => set('reflexao', e.target.value)} placeholder="Reflexão escrita pela equipe (opcional)" />
          <h2>Santo do dia</h2><textarea disabled={!admin} value={l.santo || ''} onChange={(e) => set('santo', e.target.value)} placeholder="Preencha somente com informação de fonte confiável" />
          <label>Fonte / observação</label><input disabled={!admin} value={l.fonte || ''} onChange={(e) => set('fonte', e.target.value)} />
          {admin && <div className="acoes"><button onClick={salvar}>Salvar correção</button></div>}
        </div>
      )}
      <h2>Histórico</h2>
      <table><thead><tr><th>Data</th><th>Título</th><th>Origem</th><th>Atualizada</th></tr></thead><tbody>
        {(hist || []).map((h) => <tr key={h.data} className="clicavel" onClick={() => setData(h.data)}><td>{h.data.split('-').reverse().join('/')}</td><td>{h.titulo}</td><td>{h.manual ? <span className="tag ouro">manual{h.atualizado_por && ` (${h.atualizado_por})`}</span> : <span className="tag">automática</span>}</td><td>{fmtDataHora(h.atualizado_em)}</td></tr>)}
      </tbody></table>
    </>
  );
}
