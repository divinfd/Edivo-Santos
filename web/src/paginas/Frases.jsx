import React, { useState } from 'react';
import { api } from '../api.js';
import { useCarregar, Modal } from '../App.jsx';

const VAZIA = { texto_es: '', texto_pt: '', fonte: '', ativa: true };

export default function Frases() {
  const [d, erro, recarregar] = useCarregar(() => api('/painel/frases'));
  const [ed, setEd] = useState(null);
  const [msg, setMsg] = useState('');
  async function salvar() {
    setMsg('');
    try {
      await api('/painel/frases' + (ed.id ? '/' + ed.id : ''), { metodo: ed.id ? 'PUT' : 'POST', corpo: ed });
      setEd(null); recarregar();
    } catch (e) { setMsg(e.message); }
  }
  async function excluir(f) {
    if (!confirm('Excluir esta frase?')) return;
    try { await api('/painel/frases/' + f.id, { metodo: 'DELETE' }); recarregar(); } catch (e) { alert(e.message); }
  }
  const lista = d?.lista || [];
  return (
    <>
      <h1>Frases de São Luís Guanella</h1>
      <p className="mudo">O aplicativo mostra uma frase por dia logo abaixo da mensagem de boas-vindas, girando esta lista automaticamente. Cadastre somente frases com fonte confiável.</p>
      {d?.hoje && <div className="ok"><b>Frase de hoje:</b> “{d.hoje.es}”{d.hoje.pt !== d.hoje.es && <><br /><span className="mudo">“{d.hoje.pt}”</span></>}</div>}
      <div className="acoes"><button onClick={() => setEd({ ...VAZIA })}>Nova frase</button></div>
      {erro && <div className="erro">{erro}</div>}
      <table><thead><tr><th>Espanhol</th><th>Português</th><th>Fonte</th><th></th></tr></thead><tbody>
        {lista.map((f) => (
          <tr key={f.id}>
            <td>{f.texto_es}{!f.ativa && <span className="tag vermelho">desativada</span>}</td>
            <td>{f.texto_pt}</td>
            <td className="mudo">{f.fonte}</td>
            <td className="acoes"><button className="sec" onClick={() => setEd({ ...f })}>Editar</button><button className="perigo" onClick={() => excluir(f)}>Excluir</button></td>
          </tr>
        ))}
      </tbody></table>
      {d && !lista.length && <p className="mudo">Nenhuma frase cadastrada ainda. Enquanto a lista estiver vazia, o app mostra só a mensagem de boas-vindas.</p>}
      {ed && (
        <Modal fechar={() => setEd(null)}>
          <h2 style={{ marginTop: 0 }}>{ed.id ? 'Editar frase' : 'Nova frase'}</h2>
          <label>Frase em espanhol</label><textarea value={ed.texto_es} onChange={(e) => setEd({ ...ed, texto_es: e.target.value })} />
          <label>Frase em português</label><textarea value={ed.texto_pt} onChange={(e) => setEd({ ...ed, texto_pt: e.target.value })} />
          <label>Fonte (livro, carta, site oficial)</label><input value={ed.fonte} onChange={(e) => setEd({ ...ed, fonte: e.target.value })} />
          <label className="check"><input type="checkbox" checked={ed.ativa} onChange={(e) => setEd({ ...ed, ativa: e.target.checked })} /> Mostrar no aplicativo</label>
          {msg && <div className="erro">{msg}</div>}
          <div className="acoes"><button onClick={salvar}>Salvar</button><button className="sec" onClick={() => setEd(null)}>Cancelar</button></div>
        </Modal>
      )}
    </>
  );
}
