import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDataHora, TIPOS_MENSAGEM } from '../api.js';
import { useCarregar } from '../App.jsx';

export default function Mensagens() {
  const [lista, erro, recarregar] = useCarregar(() => api('/painel/mensagens'));
  const [resp, setResp] = useState({});
  const [msg, setMsg] = useState('');
  async function responder(m) {
    setMsg('');
    try { await api(`/painel/mensagens/${m.id}/responder`, { metodo: 'POST', corpo: { resposta: resp[m.id] } }); setResp({ ...resp, [m.id]: '' }); recarregar(); }
    catch (e) { setMsg(e.message); }
  }
  return (
    <>
      <h1>Mensagens dos jovens</h1>
      <p className="mudo">Dúvidas e pedidos enviados pela área "Contato" do aplicativo. A resposta aparece no app do jovem e ele recebe uma notificação.</p>
      {(erro || msg) && <div className="erro">{erro || msg}</div>}
      {(lista || []).map((m) => (
        <div key={m.id} className="cartao">
          <div className="acoes" style={{ margin: 0 }}><Link to={'/painel/jovens/' + m.usuario_id}><b>{m.jovem}</b></Link><span className="tag">{TIPOS_MENSAGEM[m.tipo] || m.tipo}</span><span className="mudo">{fmtDataHora(m.criado_em)}</span>{!m.resposta && <span className="tag ouro">aguardando resposta</span>}</div>
          <p className="pre">{m.texto}</p>
          {m.resposta ? <div className="ok pre">{m.resposta}<div className="mudo">Respondida por {m.respondida_por_nome} em {fmtDataHora(m.respondida_em)}</div></div> : (<>
            <textarea value={resp[m.id] || ''} onChange={(e) => setResp({ ...resp, [m.id]: e.target.value })} placeholder="Escreva sua resposta..." />
            <div className="acoes"><button disabled={!resp[m.id]?.trim()} onClick={() => responder(m)}>Enviar resposta</button></div>
          </>)}
        </div>
      ))}
      {lista && !lista.length && <p className="mudo">Nenhuma mensagem recebida.</p>}
    </>
  );
}
