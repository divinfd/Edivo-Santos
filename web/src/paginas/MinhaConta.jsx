import React, { useState } from 'react';
import { api } from '../api.js';
import { useSessao } from '../App.jsx';

export default function MinhaConta() {
  const { usuario, setUsuario } = useSessao();
  const [s, setS] = useState({ atual: '', nova: '', conf: '' });
  const [e, setE] = useState({ email: usuario.email, senha: '' });
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [msgE, setMsgE] = useState('');
  const [okE, setOkE] = useState('');
  async function trocar() {
    setMsg(''); setOk('');
    if (s.nova !== s.conf) return setMsg('A confirmação não confere com a nova senha.');
    try { await api('/auth/senha', { metodo: 'POST', corpo: { atual: s.atual, nova: s.nova } }); setOk('Senha alterada.'); setS({ atual: '', nova: '', conf: '' }); } catch (x) { setMsg(x.message); }
  }
  async function trocarEmail() {
    setMsgE(''); setOkE('');
    try {
      const u = await api('/auth/email', { metodo: 'POST', corpo: e });
      setUsuario({ ...usuario, ...u });
      setE({ email: u.email, senha: '' });
      setOkE('E-mail alterado. Use o novo e-mail para entrar a partir de agora.');
    } catch (x) { setMsgE(x.message); }
  }
  return (
    <>
      <h1>Minha conta</h1>
      <div className="cartao" style={{ maxWidth: 480 }}>
        <p><b>{usuario.nome}</b><br /><span className="mudo">{usuario.email}</span></p>
        <h2>Trocar e-mail de acesso</h2>
        <label>Novo e-mail</label><input type="email" value={e.email} onChange={(x) => setE({ ...e, email: x.target.value })} />
        <label>Senha atual (para confirmar)</label><input type="password" value={e.senha} onChange={(x) => setE({ ...e, senha: x.target.value })} />
        {msgE && <div className="erro">{msgE}</div>}{okE && <div className="ok">{okE}</div>}
        <div className="acoes"><button onClick={trocarEmail} disabled={!e.email || !e.senha || e.email === usuario.email}>Salvar novo e-mail</button></div>
        <h2>Trocar senha</h2>
        <label>Senha atual</label><input type="password" value={s.atual} onChange={(x) => setS({ ...s, atual: x.target.value })} />
        <label>Nova senha (mínimo 8 caracteres, com letras e números)</label><input type="password" value={s.nova} onChange={(x) => setS({ ...s, nova: x.target.value })} />
        <label>Confirme a nova senha</label><input type="password" value={s.conf} onChange={(x) => setS({ ...s, conf: x.target.value })} />
        {msg && <div className="erro">{msg}</div>}{ok && <div className="ok">{ok}</div>}
        <div className="acoes"><button onClick={trocar}>Salvar nova senha</button></div>
      </div>
    </>
  );
}
