const CHAVE = 'vg_painel_token';
export const getToken = () => sessionStorage.getItem(CHAVE);
export const setToken = (t) => (t ? sessionStorage.setItem(CHAVE, t) : sessionStorage.removeItem(CHAVE));

export async function api(caminho, { metodo = 'GET', corpo, bruto, tipo } = {}) {
  const headers = {};
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  let body;
  if (bruto) {
    body = bruto;
    headers['content-type'] = tipo || 'application/octet-stream';
  } else if (corpo !== undefined) {
    body = JSON.stringify(corpo);
    headers['content-type'] = 'application/json';
  }
  const r = await fetch('/api' + caminho, { method: metodo, headers, body });
  if (r.status === 401 && caminho !== '/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('sessao-expirada'));
  }
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    if (!r.ok) throw new Error('Erro ' + r.status);
    return r.arrayBuffer();
  }
  const d = await r.json();
  if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
  return d;
}

export const imagemUrl = (key) => (key ? `/api/imagens/${encodeURIComponent(key)}` : null);

export async function enviarPdf(arquivo, aoProgredir) {
  const f = await api('/painel/arquivos', { metodo: 'POST', corpo: { nome: arquivo.name, tamanho: arquivo.size } });
  for (let i = 0; i < f.partes; i++) {
    const parte = arquivo.slice(i * f.tamanho_parte, (i + 1) * f.tamanho_parte);
    let tentativas = 0;
    for (;;) {
      try {
        await api(`/painel/arquivos/${f.id}/partes/${i}`, { metodo: 'PUT', bruto: parte });
        break;
      } catch (e) {
        if (++tentativas >= 3) throw e;
      }
    }
    aoProgredir?.(Math.round(((i + 1) / f.partes) * 100));
  }
  return api(`/painel/arquivos/${f.id}/concluir`, { metodo: 'POST', corpo: {} });
}

export async function baixarPdf(id, partes) {
  const pedacos = [];
  for (let i = 0; i < partes; i++) pedacos.push(await api(`/painel/arquivos/${id}/partes/${i}`));
  return new Blob(pedacos, { type: 'application/pdf' });
}

export async function enviarImagem(arquivo) {
  const img = await new Promise((ok, erro) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = erro;
    i.src = URL.createObjectURL(arquivo);
  });
  const max = 1400;
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  return (await api('/painel/imagens', { metodo: 'POST', bruto: blob, tipo: 'image/jpeg' })).key;
}

export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
export const fmtDataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');
export const TIPOS_PERGUNTA = { texto_longo: 'Texto livre', texto_curto: 'Resposta curta', multipla: 'Múltipla escolha', escala: 'Escala de avaliação' };
export const TIPOS_MENSAGEM = { duvida: 'Dúvida', orientacao: 'Pedido de orientação vocacional', encontros: 'Informações sobre encontros', mensagem: 'Mensagem' };
