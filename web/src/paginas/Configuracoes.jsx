import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Configuracoes() {
  const [c, setC] = useState(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  useEffect(() => { api('/painel/config').then(setC).catch((e) => setMsg(e.message)); }, []);
  if (!c) return msg ? <div className="erro">{msg}</div> : <p>Carregando...</p>;
  const setCt = (k) => (e) => setC({ ...c, contato: { ...c.contato, [k]: e.target.value } });
  async function salvar() {
    setMsg(''); setOk('');
    try { setC(await api('/painel/config', { metodo: 'PUT', corpo: c })); setOk('Configurações salvas. O aplicativo já mostra as novas informações.'); } catch (e) { setMsg(e.message); }
  }
  return (
    <>
      <h1>Configurações</h1>
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Aplicativo</h2>
        <label>Mensagem espiritual da tela inicial (português)</label><textarea value={c.mensagem_espiritual} onChange={(e) => setC({ ...c, mensagem_espiritual: e.target.value })} />
        <label>Mensagem espiritual em espanhol (idioma principal do app)</label><textarea value={c.mensagem_espiritual_es || ''} onChange={(e) => setC({ ...c, mensagem_espiritual_es: e.target.value })} />
      </div>
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Contato do responsável vocacional</h2>
        <p className="mudo">Estas informações aparecem no módulo "Contato" do aplicativo. Campos vazios não são mostrados.</p>
        <div className="linha">
          <div><label>Nome</label><input value={c.contato.nome} onChange={setCt('nome')} /></div>
          <div><label>Telefone</label><input value={c.contato.telefone} onChange={setCt('telefone')} /></div>
          <div><label>WhatsApp (com DDI e DDD, ex.: 5511999999999)</label><input value={c.contato.whatsapp} onChange={setCt('whatsapp')} /></div>
          <div><label>E-mail</label><input value={c.contato.email} onChange={setCt('email')} /></div>
        </div>
        <label>Apresentação</label><textarea value={c.contato.apresentacao} onChange={setCt('apresentacao')} />
        <label>Informações sobre encontros vocacionais</label><textarea value={c.contato.encontros} onChange={setCt('encontros')} />
      </div>
      {msg && <div className="erro">{msg}</div>}{ok && <div className="ok">{ok}</div>}
      <div className="acoes"><button onClick={salvar}>Salvar configurações</button></div>
    </>
  );
}
