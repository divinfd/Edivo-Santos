import React, { useState } from 'react';
import { api } from '../api.js';
import { useSessao } from '../App.jsx';

export default function MinhaConta() {
  const { usuario } = useSessao();
  const [s, setS] = useState({ atual: '', nova: '', conf: '' });
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  async function trocar() {
    setMsg(''); setOk('');
    if (s.nova !== s.conf) return setMsg('A confirmação não confere com a nova senha.');
    try { await api('/auth/senha', { metodo: 'POST', corpo: { atual: s.atual, nova: s.nova } }); setOk('Senha alterada.'); setS({ atual: '', nova: '', conf: '' }); } catch (e) { setMsg(e.message); }
  }
  return (
    <>
      <h1>Minha conta</h1>
      <div className="cartao" style={{ maxWidth: 480 }}>
        <p><b>{usuario.nome}</b><br /><span className="mudo">{usuario.email}</span></p>
        <h2>Trocar senha</h2>
        <label>Senha atual</label><input type="password" value={s.atual} onChange={(e) => setS({ ...s, atual: e.target.value })} />
        <label>Nova senha (mínimo 8 caracteres, com letras e números)</label><input type="password" value={s.nova} onChange={(e) => setS({ ...s, nova: e.target.value })} />
        <label>Confirme a nova senha</label><input type="password" value={s.conf} onChange={(e) => setS({ ...s, conf: e.target.value })} />
        {msg && <div className="erro">{msg}</div>}{ok && <div className="ok">{ok}</div>}
        <div className="acoes"><button onClick={trocar}>Salvar nova senha</button></div>
      </div>
    </>
  );
}
