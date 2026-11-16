import React, { useEffect, useState, createContext, useContext } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import Dashboard from './paginas/Dashboard.jsx';
import Jovens, { JovemDetalhe } from './paginas/Jovens.jsx';
import Grupos from './paginas/Grupos.jsx';
import Equipe from './paginas/Equipe.jsx';
import Atividades, { AtividadeEditor } from './paginas/Atividades.jsx';
import Respostas from './paginas/Respostas.jsx';
import Familia from './paginas/Familia.jsx';
import Frases from './paginas/Frases.jsx';
import Notificacoes from './paginas/Notificacoes.jsx';
import Mensagens from './paginas/Mensagens.jsx';
import Configuracoes from './paginas/Configuracoes.jsx';
import Auditoria from './paginas/Auditoria.jsx';
import MinhaConta from './paginas/MinhaConta.jsx';

export const Sessao = createContext(null);
export const useSessao = () => useContext(Sessao);

function Login({ aoEntrar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  async function entrar(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const r = await api('/auth/login', { metodo: 'POST', corpo: { email, senha, origem: 'painel' } });
      setToken(r.token);
      aoEntrar(r.usuario);
    } catch (e) {
      setErro(e.message);
    }
    setCarregando(false);
  }
  return (
    <div className="login">
      <form className="cartao" onSubmit={entrar}>
        <img src="/icone.png" alt="" />
        <h1>Painel Vocacional</h1>
        <p className="mudo" style={{ textAlign: 'center', marginTop: -8 }}>Hermanas Guanelianas</p>
        <label>E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <label>Senha</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {erro && <div className="erro">{erro}</div>}
        <button style={{ width: '100%', marginTop: 16 }} disabled={carregando}>{carregando ? 'Entrando...' : 'Entrar'}</button>
        <p className="mudo" style={{ marginTop: 14 }}>Esqueceu a senha? Peça a um administrador para criar uma senha nova em "Equipe".</p>
      </form>
    </div>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(!!getToken());
  const [contadores, setContadores] = useState({});
  const navegar = useNavigate();

  useEffect(() => {
    if (getToken()) api('/auth/eu').then(setUsuario).catch(() => setToken(null)).finally(() => setCarregando(false));
    const sair = () => setUsuario(null);
    window.addEventListener('sessao-expirada', sair);
    return () => window.removeEventListener('sessao-expirada', sair);
  }, []);

  useEffect(() => {
    if (!usuario) return;
    const atualizar = () => api('/painel/dashboard?dias=7').then((d) => setContadores(d.indicadores)).catch(() => {});
    atualizar();
    const t = setInterval(atualizar, 60000);
    return () => clearInterval(t);
  }, [usuario]);

  if (carregando) return <div className="login"><div className="cartao">Carregando...</div></div>;
  if (!usuario) return <Login aoEntrar={(u) => { setUsuario(u); navegar('/painel'); }} />;

  const admin = usuario.papel === 'admin';
  async function sair() {
    try { await api('/auth/sair', { metodo: 'POST', corpo: {} }); } catch {}
    setToken(null);
    setUsuario(null);
  }
  const B = ({ n }) => (n ? <span className="badge">{n}</span> : null);

  return (
    <Sessao.Provider value={{ usuario, admin, setUsuario, atualizarContadores: () => api('/painel/dashboard?dias=7').then((d) => setContadores(d.indicadores)) }}>
      <div className="layout">
        <nav className="menu">
          <div className="marca"><b>Vocacional</b><small>Hermanas Guanelianas</small></div>
          <NavLink to="/painel" end>Início</NavLink>
          <NavLink to="/painel/jovens">Jovens <B n={contadores.aguardando_aprovacao} /></NavLink>
          <NavLink to="/painel/grupos">Grupos</NavLink>
          <NavLink to="/painel/atividades">Orações e materiais</NavLink>
          <NavLink to="/painel/respostas">Feedback <B n={contadores.respostas_nao_lidas} /></NavLink>
          <NavLink to="/painel/mensagens">Mensagens <B n={contadores.mensagens_abertas} /></NavLink>
          <NavLink to="/painel/notificacoes">Notificações</NavLink>
          {admin && <NavLink to="/painel/familia">Família Guanelliana</NavLink>}
          {admin && <NavLink to="/painel/frases">Frases do dia</NavLink>}
          {admin && <NavLink to="/painel/equipe">Equipe</NavLink>}
          {admin && <NavLink to="/painel/configuracoes">Configurações</NavLink>}
          {admin && <NavLink to="/painel/auditoria">Registros de acesso</NavLink>}
          <NavLink to="/painel/conta">Minha conta</NavLink>
          <div className="sair">{usuario.nome}<br /><span className="mudo" style={{ color: '#c9d6e8' }}>{admin ? 'Administrador' : 'Responsável vocacional'}</span><br /><button onClick={sair}>Sair</button></div>
        </nav>
        <main className="conteudo">
          <Routes>
            <Route path="/painel" element={<Dashboard />} />
            <Route path="/painel/jovens" element={<Jovens />} />
            <Route path="/painel/jovens/:id" element={<JovemDetalhe />} />
            <Route path="/painel/grupos" element={<Grupos />} />
            <Route path="/painel/atividades" element={<Atividades />} />
            <Route path="/painel/atividades/:id" element={<AtividadeEditor />} />
            <Route path="/painel/respostas" element={<Respostas />} />
            <Route path="/painel/mensagens" element={<Mensagens />} />
            <Route path="/painel/notificacoes" element={<Notificacoes />} />
            <Route path="/painel/familia" element={<Familia />} />
            <Route path="/painel/frases" element={<Frases />} />
            <Route path="/painel/equipe" element={<Equipe />} />
            <Route path="/painel/configuracoes" element={<Configuracoes />} />
            <Route path="/painel/auditoria" element={<Auditoria />} />
            <Route path="/painel/conta" element={<MinhaConta />} />
            <Route path="*" element={<Navigate to="/painel" />} />
          </Routes>
        </main>
      </div>
    </Sessao.Provider>
  );
}

export function useCarregar(fn, deps = []) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const recarregar = () => fn().then((d) => { setDados(d); setErro(''); }).catch((e) => setErro(e.message));
  useEffect(() => { recarregar(); }, deps);
  return [dados, erro, recarregar, setDados];
}

export function Modal({ children, fechar }) {
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal">{children}</div>
    </div>
  );
}
