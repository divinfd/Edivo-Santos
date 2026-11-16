import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { api, fmtDataHora } from '../api.js';
import { useCarregar } from '../App.jsx';

export default function Dashboard() {
  const [dias, setDias] = useState(30);
  const [d, erro] = useCarregar(() => api('/painel/dashboard?dias=' + dias), [dias]);
  const [status] = useCarregar(() => api('/painel/status'));
  const [recs, , recarregarRecs] = useCarregar(() => api('/painel/recuperacoes'));
  if (erro) return <div className="erro">{erro}</div>;
  if (!d) return <p>Carregando...</p>;
  const i = d.indicadores;
  const cards = [
    ['Total de jovens', i.total_jovens], ['Participantes ativos (30 dias)', i.ativos], [`Novos cadastros (${dias} dias)`, i.novos],
    ['Aguardando aprovação', i.aguardando_aprovacao, 'ouro'], ['Orações publicadas', i.publicadas], ['Orações concluídas', i.concluidas],
    ['Respostas recebidas', i.respostas], ['Respostas não lidas', i.respostas_nao_lidas, 'ouro'], ['Feedbacks pendentes', i.pendentes], ['Mensagens sem resposta', i.mensagens_abertas, 'ouro'],
  ];
  const serie = d.serie.map((s) => ({ ...s, dia: s.dia.slice(8, 10) + '/' + s.dia.slice(5, 7) }));
  return (
    <>
      <h1>Visão geral</h1>
      {status && (!status.push || !status.email) && (
        <div className="aviso">
          {!status.push && 'Notificações push ainda não configuradas no servidor. '}
          {!status.email && 'Envio de e-mail de recuperação não configurado: os pedidos de nova senha aparecem abaixo para atendimento manual.'}
        </div>
      )}
      {recs?.length > 0 && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Pedidos de recuperação de senha</h2>
          <table><tbody>
            {recs.map((r) => (
              <tr key={r.id}>
                <td>{r.nome}<div className="mudo">{r.email}</div></td>
                <td>{fmtDataHora(r.criado_em)} {r.email_enviado ? <span className="tag verde">e-mail enviado</span> : <span className="tag ouro">aguardando atendimento</span>}</td>
                <td>
                  {r.papel === 'jovem' && <Link className="botao" to={`/painel/jovens/${r.usuario_id}`}>Abrir jovem</Link>}{' '}
                  <button className="sec" onClick={() => api(`/painel/recuperacoes/${r.usuario_id}/atendido`, { metodo: 'POST', corpo: {} }).then(recarregarRecs)}>Marcar como atendido</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
      <div className="grade">{cards.map(([t, n, c]) => <div key={t} className={'indicador ' + (c || '')}><b>{n}</b><span>{t}</span></div>)}</div>
      <div className="cartao" style={{ marginTop: 16 }}>
        <div className="acoes" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Participação por período</h2>
          <select style={{ width: 160 }} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Último ano</option>
          </select>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={serie}>
              <CartesianGrid stroke="#eef2f7" /><XAxis dataKey="dia" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Legend />
              <Line type="monotone" dataKey="respostas" name="Respostas" stroke="#1f4e8c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="concluidas" name="Orações concluídas" stroke="#c9a227" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cadastros" name="Novos cadastros" stroke="#2e7d4f" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Últimas respostas</h2>
        {!d.ultimas.length ? <p className="mudo">Nenhuma resposta ainda.</p> : (
          <table><thead><tr><th>Jovem</th><th>Atividade</th><th>Enviada</th><th></th></tr></thead><tbody>
            {d.ultimas.map((r) => (
              <tr key={r.id}><td><Link to={`/painel/jovens/${r.jovem_id}`}>{r.jovem}</Link></td><td>{r.atividade}</td><td>{fmtDataHora(r.enviada_em)}</td>
                <td>{r.lida_em ? <span className="tag cinza">lida</span> : <span className="tag ouro">nova</span>} <Link to={`/painel/respostas?abrir=${r.id}`}>Ver</Link></td></tr>
            ))}
          </tbody></table>
        )}
      </div>
    </>
  );
}
