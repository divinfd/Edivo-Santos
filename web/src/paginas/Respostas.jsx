import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDataHora, TIPOS_PERGUNTA } from '../api.js';
import { useCarregar, Modal } from '../App.jsx';

const valorTexto = (v) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : String(v));

function Detalhe({ id, fechar }) {
  const [r, erro, recarregar] = useCarregar(() => api('/painel/respostas/' + id), [id]);
  const [obs, setObs] = useState('');
  async function salvarObs() {
    await api(`/painel/jovens/${r.jovem_id}/observacoes`, { metodo: 'POST', corpo: { texto: obs, resposta_id: r.id } });
    setObs('');
    recarregar();
  }
  return (
    <Modal fechar={fechar}>
      {erro && <div className="erro">{erro}</div>}
      {!r ? <p>Carregando...</p> : (<>
        <h2 style={{ marginTop: 0 }}>{r.atividade}</h2>
        <p><Link to={'/painel/jovens/' + r.jovem_id}>{r.jovem}</Link> · enviada em {fmtDataHora(r.enviada_em)}</p>
        {r.itens.map((i) => (
          <div key={i.pergunta_id} className="resposta-item"><b>{i.pergunta}</b><span className="mudo">{TIPOS_PERGUNTA[i.tipo]}{i.tipo === 'escala' && ` (${i.opcoes[0]} a ${i.opcoes[1]})`}</span><p>{valorTexto(i.valor)}</p></div>
        ))}
        {r.comentario && <div className="resposta-item"><b>Comentário livre</b><p>{r.comentario}</p></div>}
        <h2>Observações privadas sobre esta resposta</h2>
        {r.observacoes.map((o) => <div key={o.id} className="pergunta"><div className="pre">{o.texto}</div><div className="mudo">{o.autor} · {fmtDataHora(o.criado_em)}</div></div>)}
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Somente a equipe verá esta observação." />
        <div className="acoes"><button disabled={!obs.trim()} onClick={salvarObs}>Salvar observação</button><button className="sec" onClick={fechar}>Fechar</button></div>
      </>)}
    </Modal>
  );
}

export default function Respostas() {
  const [sp, setSp] = useSearchParams();
  const [f, setF] = useState({ jovem: '', atividade: '', de: '', ate: '' });
  const [lista, erro, recarregar] = useCarregar(() => api('/painel/respostas?' + new URLSearchParams(f)), [f]);
  const [jovens] = useCarregar(() => api('/painel/jovens'));
  const [atividades] = useCarregar(() => api('/painel/atividades'));
  const abrir = sp.get('abrir');
  useEffect(() => {}, [abrir]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function linhas() {
    const perguntas = new Map();
    for (const r of lista || []) for (const i of r.itens) if (!perguntas.has(i.pergunta_id)) perguntas.set(i.pergunta_id, i.pergunta);
    const chaves = [...perguntas.keys()];
    const cab = ['Jovem', 'Atividade', 'Categoria', 'Enviada em', ...chaves.map((k) => perguntas.get(k)), 'Comentário'];
    const dados = (lista || []).map((r) => [r.jovem, r.atividade, r.categoria, fmtDataHora(r.enviada_em), ...chaves.map((k) => valorTexto(r.itens.find((i) => i.pergunta_id === k)?.valor)), r.comentario || '']);
    return { cab, dados };
  }
  async function excel() {
    const XLSX = await import('xlsx');
    const { cab, dados } = linhas();
    const ws = XLSX.utils.aoa_to_sheet([cab, ...dados]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Respostas');
    XLSX.writeFile(wb, `feedback-vocacional-${new Date().toISOString().slice(0, 10)}.xlsx`);
    api('/painel/auditoria/evento', { metodo: 'POST', corpo: { acao: 'relatorio_exportado_excel', filtros: f } });
  }
  async function pdf() {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Vocacional Hermanas Guanelianas - Relatório de feedback', 14, 14);
    doc.setFontSize(9);
    doc.text(`Gerado em ${fmtDataHora(new Date())} · ${lista.length} resposta(s) · documento confidencial`, 14, 20);
    const corpo = [];
    for (const r of lista) {
      corpo.push([{ content: `${r.jovem} — ${r.atividade} — ${fmtDataHora(r.enviada_em)}`, colSpan: 2, styles: { fillColor: [234, 241, 250], fontStyle: 'bold' } }]);
      for (const i of r.itens) corpo.push([i.pergunta, valorTexto(i.valor)]);
      if (r.comentario) corpo.push(['Comentário', r.comentario]);
    }
    doc.autoTable({ startY: 25, head: [['Pergunta', 'Resposta']], body: corpo, styles: { fontSize: 9 }, headStyles: { fillColor: [31, 78, 140] }, columnStyles: { 0: { cellWidth: 90 } } });
    doc.save(`feedback-vocacional-${new Date().toISOString().slice(0, 10)}.pdf`);
    api('/painel/auditoria/evento', { metodo: 'POST', corpo: { acao: 'relatorio_exportado_pdf', filtros: f } });
  }
  return (
    <>
      <h1>Feedback dos jovens</h1>
      <div className="filtros">
        <select value={f.jovem} onChange={set('jovem')}><option value="">Todos os jovens</option>{(jovens || []).map((j) => <option key={j.id} value={j.id}>{j.nome}</option>)}</select>
        <select value={f.atividade} onChange={set('atividade')}><option value="">Todas as atividades</option>{(atividades || []).map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}</select>
        <div><label style={{ margin: 0 }}>De</label><input type="date" value={f.de} onChange={set('de')} /></div>
        <div><label style={{ margin: 0 }}>Até</label><input type="date" value={f.ate} onChange={set('ate')} /></div>
        <button className="sec" onClick={excel} disabled={!lista?.length}>Exportar Excel</button>
        <button className="sec" onClick={pdf} disabled={!lista?.length}>Exportar PDF</button>
      </div>
      {erro && <div className="erro">{erro}</div>}
      <table><thead><tr><th>Jovem</th><th>Atividade</th><th>Enviada</th><th>Prévia</th><th></th></tr></thead><tbody>
        {(lista || []).map((r) => (
          <tr key={r.id} className="clicavel" onClick={() => setSp({ abrir: r.id })}>
            <td><b>{r.jovem}</b></td><td>{r.atividade}<div className="mudo">{r.categoria}</div></td><td>{fmtDataHora(r.enviada_em)}</td>
            <td className="mudo" style={{ maxWidth: 320 }}>{valorTexto(r.itens[0]?.valor).slice(0, 120)}</td>
            <td>{r.lida_em ? <span className="tag cinza">lida</span> : <span className="tag ouro">nova</span>}</td>
          </tr>
        ))}
        {lista && !lista.length && <tr><td colSpan={5} className="mudo">Nenhuma resposta encontrada.</td></tr>}
      </tbody></table>
      {abrir && <Detalhe id={abrir} fechar={() => { setSp({}); recarregar(); }} />}
    </>
  );
}
