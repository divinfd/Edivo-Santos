import React, { useState } from 'react';
import { api, enviarImagem, imagemUrl } from '../api.js';
import { useCarregar, Modal } from '../App.jsx';

export default function Familia() {
  const [lista, erro, recarregar] = useCarregar(() => api('/painel/conteudos'));
  const [status] = useCarregar(() => api('/painel/status'));
  const [ed, setEd] = useState(null);
  const [msg, setMsg] = useState('');
  const secoes = status?.secoes || {};
  async function salvar() {
    setMsg('');
    try {
      if (ed.id) await api('/painel/conteudos/' + ed.id, { metodo: 'PUT', corpo: ed });
      else await api('/painel/conteudos', { metodo: 'POST', corpo: ed });
      setEd(null);
      recarregar();
    } catch (e) { setMsg(e.message); }
  }
  async function excluir(c) {
    if (!confirm(`Excluir "${c.titulo}"?`)) return;
    await api('/painel/conteudos/' + c.id, { metodo: 'DELETE' });
    recarregar();
  }
  async function imagem(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { setEd({ ...ed, imagem_key: await enviarImagem(f) }); } catch (er) { setMsg(er.message); }
  }
  return (
    <>
      <h1>Família Guanelliana</h1>
      <p className="mudo">Textos, fotos e vídeos que os jovens veem no módulo "Família Guanelliana". Escreva cada texto em português e em espanhol: o app mostra o idioma escolhido pelo jovem (sem a versão em espanhol, mostra o português). Use apenas imagens e vídeos com autorização de uso.</p>
      {erro && <div className="erro">{erro}</div>}
      {Object.entries(secoes).map(([k, nome]) => (
        <div key={k} className="cartao">
          <div className="acoes" style={{ justifyContent: 'space-between', margin: 0 }}>
            <h2 style={{ margin: 0 }}>{nome}</h2>
            <button className="sec" onClick={() => setEd({ secao: k, titulo: '', texto: '', titulo_es: '', texto_es: '', imagem_key: '', video_url: '', ordem: (lista || []).filter((c) => c.secao === k).length, publicado: true })}>+ Adicionar texto</button>
          </div>
          {(lista || []).filter((c) => c.secao === k).map((c) => (
            <div key={c.id} className="pergunta" style={{ display: 'flex', gap: 12 }}>
              {c.imagem_key && <img src={imagemUrl(c.imagem_key)} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8 }} />}
              <div style={{ flex: 1 }}>
                <b>{c.titulo}</b> {!c.publicado && <span className="tag cinza">oculto</span>} {c.video_url && <span className="tag">vídeo</span>} {!c.titulo_es?.trim() && <span className="tag cinza">sem espanhol</span>}
                <div className="mudo">{(c.texto || '').slice(0, 180)}{c.texto?.length > 180 && '...'}</div>
              </div>
              <div className="acoes" style={{ margin: 0 }}><button className="sec" onClick={() => setEd({ ...c, titulo_es: c.titulo_es || '', texto_es: c.texto_es || '', imagem_key: c.imagem_key || '', video_url: c.video_url || '' })}>Editar</button><button className="perigo" onClick={() => excluir(c)}>Excluir</button></div>
            </div>
          ))}
        </div>
      ))}
      {ed && (
        <Modal fechar={() => setEd(null)}>
          <h2 style={{ marginTop: 0 }}>{ed.id ? 'Editar' : 'Novo'} conteúdo</h2>
          <div className="linha">
            <div><label>Seção</label><select value={ed.secao} onChange={(e) => setEd({ ...ed, secao: e.target.value })}>{Object.entries(secoes).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
            <div><label>Ordem</label><input type="number" value={ed.ordem} onChange={(e) => setEd({ ...ed, ordem: Number(e.target.value) })} /></div>
          </div>
          <label>Título (português)</label><input value={ed.titulo} onChange={(e) => setEd({ ...ed, titulo: e.target.value })} />
          <label>Texto (português)</label><textarea style={{ minHeight: 180 }} value={ed.texto} onChange={(e) => setEd({ ...ed, texto: e.target.value })} />
          <label>Título (espanhol)</label><input value={ed.titulo_es} onChange={(e) => setEd({ ...ed, titulo_es: e.target.value })} />
          <label>Texto (espanhol)</label><textarea style={{ minHeight: 180 }} value={ed.texto_es} onChange={(e) => setEd({ ...ed, texto_es: e.target.value })} />
          <label>Fotografia</label>
          {ed.imagem_key && <div><img src={imagemUrl(ed.imagem_key)} alt="" style={{ maxWidth: 200, borderRadius: 8 }} /><br /><button className="link" onClick={() => setEd({ ...ed, imagem_key: '' })}>remover</button></div>}
          <input type="file" accept="image/*" onChange={imagem} />
          <label>Vídeo (link do YouTube ou Vimeo, opcional)</label><input value={ed.video_url} onChange={(e) => setEd({ ...ed, video_url: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." />
          <label className="check"><input type="checkbox" checked={ed.publicado} onChange={(e) => setEd({ ...ed, publicado: e.target.checked })} /> Visível no aplicativo</label>
          {msg && <div className="erro">{msg}</div>}
          <div className="acoes"><button onClick={salvar}>Salvar</button><button className="sec" onClick={() => setEd(null)}>Cancelar</button></div>
        </Modal>
      )}
    </>
  );
}
