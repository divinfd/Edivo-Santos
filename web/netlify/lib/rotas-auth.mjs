import crypto from 'node:crypto';
import {
  q, q1, falha, json, hashSenha, confereSenha, validarSenha, criarSessao, autenticar, auditar,
  texto, emailValido, idade, sha256, configCompleta,
} from './core.mjs';
import { enviarEmail } from './email.mjs';

const perfil = (u) => ({
  id: u.id, nome: u.nome, email: u.email, papel: u.papel, telefone: u.telefone || '',
  data_nascimento: u.data_nascimento ? new Date(u.data_nascimento).toISOString().slice(0, 10) : null,
});

export default function (r) {
  r('GET', '/publico/config', async () => {
    const c = await configCompleta();
    return json({ nome_app: c.nome_app, mensagem_espiritual: c.mensagem_espiritual });
  });

  r('POST', '/auth/login', async ({ body, ip }) => {
    const email = texto(body.email, 200).toLowerCase();
    const origem = body.origem === 'painel' ? 'painel' : 'app';
    const falhas = await q1(
      "SELECT count(*)::int AS n FROM auditoria WHERE acao = 'login_falhou' AND detalhe->>'email' = $1 AND criado_em > now() - interval '15 minutes'",
      [email],
    );
    if (falhas.n >= 8) falha(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
    const u = await q1('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (!u || !confereSenha(body.senha || '', u.senha_hash)) {
      await auditar(null, 'login_falhou', { email, origem }, ip);
      falha(401, 'E-mail ou senha incorretos.');
    }
    if (u.status === 'pendente') falha(403, 'Seu cadastro foi recebido e aguarda a aprovação do responsável vocacional.');
    if (u.status !== 'ativo') falha(403, 'Sua conta está desativada. Fale com o responsável vocacional.');
    if (origem === 'painel' && u.papel === 'jovem') falha(403, 'Este acesso é exclusivo dos responsáveis vocacionais.');
    const token = await criarSessao(u.id, origem);
    if (origem === 'painel') await auditar(u, 'login_painel', null, ip);
    return json({ token, usuario: perfil(u) });
  });

  r('POST', '/auth/cadastro', async ({ body, ip }) => {
    const nome = texto(body.nome, 120);
    if (nome.length < 3) falha(400, 'Informe seu nome completo.');
    const email = emailValido(body.email);
    const senha = validarSenha(body.senha);
    const nasc = texto(body.data_nascimento, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc)) falha(400, 'Informe sua data de nascimento.');
    const id = idade(nasc);
    if (id === null || id < 10 || id > 100) falha(400, 'Data de nascimento inválida.');
    if (!body.aceite_privacidade) falha(400, 'É preciso aceitar a Política de Privacidade.');
    let legalNome = null, legalContato = null, consent = null;
    if (id < 18) {
      legalNome = texto(body.responsavel_legal_nome, 120);
      legalContato = texto(body.responsavel_legal_contato, 120);
      if (legalNome.length < 3 || legalContato.length < 5) falha(400, 'Para menores de 18 anos, informe o nome e o contato (telefone ou e-mail) do pai, mãe ou responsável legal.');
      if (!body.consentimento_responsavel) falha(400, 'Para menores de 18 anos é necessária a autorização do responsável legal.');
      consent = new Date();
    }
    const existe = await q1('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existe) falha(409, 'Este e-mail já está cadastrado. Use "Esqueci minha senha" se precisar.');
    const novo = await q1(
      `INSERT INTO usuarios (nome, email, senha_hash, papel, status, data_nascimento, telefone, responsavel_legal_nome, responsavel_legal_contato, consentimento_declarado_em)
       VALUES ($1,$2,$3,'jovem','pendente',$4,$5,$6,$7,$8) RETURNING id`,
      [nome, email, hashSenha(senha), nasc, texto(body.telefone, 30) || null, legalNome, legalContato, consent],
    );
    await auditar({ id: novo.id }, 'cadastro_app', { menor: id < 18 }, ip);
    return json({ ok: true, mensagem: 'Cadastro enviado! Assim que o responsável vocacional aprovar, você poderá entrar.' }, 201);
  });

  r('POST', '/auth/esqueci', async ({ body, ip }) => {
    const email = texto(body.email, 200).toLowerCase();
    const u = await q1("SELECT id, nome, email FROM usuarios WHERE email = $1 AND status = 'ativo'", [email]);
    if (u) {
      const recente = await q1("SELECT count(*)::int AS n FROM recuperacao_senha WHERE usuario_id = $1 AND criado_em > now() - interval '1 hour'", [u.id]);
      if (recente.n < 5) {
        const codigo = String(crypto.randomInt(100000, 1000000));
        const enviado = await enviarEmail(
          u.email,
          'Código para redefinir sua senha',
          `<p>Olá, ${u.nome.split(' ')[0]}!</p><p>Seu código para criar uma nova senha no aplicativo é:</p><h2 style="letter-spacing:4px">${codigo}</h2><p>Ele vale por 30 minutos. Se você não pediu, ignore este e-mail.</p>`,
        );
        await q(
          "INSERT INTO recuperacao_senha (usuario_id, codigo_hash, expira_em, email_enviado) VALUES ($1,$2, now() + interval '30 minutes', $3)",
          [u.id, sha256(u.id + ':' + codigo), enviado],
        );
        await auditar(u, 'recuperacao_pedida', { email_enviado: enviado }, ip);
      }
    }
    return json({
      ok: true,
      mensagem: 'Se o e-mail estiver cadastrado, enviaremos um código. Se ele não chegar, o responsável vocacional também foi avisado e pode criar uma senha nova para você.',
    });
  });

  r('POST', '/auth/redefinir', async ({ body, ip }) => {
    const email = texto(body.email, 200).toLowerCase();
    const codigo = texto(body.codigo, 10);
    const senha = validarSenha(body.nova_senha);
    const u = await q1("SELECT id FROM usuarios WHERE email = $1 AND status = 'ativo'", [email]);
    if (!u) falha(400, 'Código inválido ou expirado.');
    const rec = await q1(
      'SELECT id FROM recuperacao_senha WHERE usuario_id = $1 AND codigo_hash = $2 AND NOT usado AND tentativas < 5 AND expira_em > now() ORDER BY id DESC LIMIT 1',
      [u.id, sha256(u.id + ':' + codigo)],
    );
    if (!rec) {
      await q('UPDATE recuperacao_senha SET tentativas = tentativas + 1 WHERE usuario_id = $1 AND NOT usado AND expira_em > now()', [u.id]);
      await auditar(u, 'redefinicao_falhou', null, ip);
      falha(400, 'Código inválido ou expirado.');
    }
    await q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hashSenha(senha), u.id]);
    await q('UPDATE recuperacao_senha SET usado = true, atendido = true WHERE usuario_id = $1', [u.id]);
    await q('DELETE FROM sessoes WHERE usuario_id = $1', [u.id]);
    await auditar(u, 'senha_redefinida', null, ip);
    return json({ ok: true, mensagem: 'Senha alterada! Entre com a nova senha.' });
  });

  r('POST', '/auth/sair', async ({ req, body }) => {
    const u = await autenticar(req);
    await q('DELETE FROM sessoes WHERE token_hash = $1', [u.token_hash]);
    if (body.dispositivo) await q('DELETE FROM dispositivos WHERE token = $1', [texto(body.dispositivo, 500)]);
    return json({ ok: true });
  });

  r('GET', '/auth/eu', async ({ req }) => json(perfil(await autenticar(req))));

  r('PUT', '/auth/eu', async ({ req, body, ip }) => {
    const u = await autenticar(req);
    const nome = texto(body.nome, 120);
    if (nome.length < 3) falha(400, 'Informe o nome completo.');
    await q('UPDATE usuarios SET nome = $1, telefone = $2 WHERE id = $3', [nome, texto(body.telefone, 30) || null, u.id]);
    await auditar(u, 'perfil_corrigido', null, ip);
    return json(perfil({ ...u, nome, telefone: texto(body.telefone, 30) }));
  });

  r('POST', '/auth/senha', async ({ req, body, ip }) => {
    const u = await autenticar(req);
    const atual = await q1('SELECT senha_hash FROM usuarios WHERE id = $1', [u.id]);
    if (!confereSenha(body.atual || '', atual.senha_hash)) falha(400, 'A senha atual está incorreta.');
    await q('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hashSenha(validarSenha(body.nova)), u.id]);
    await q('DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2', [u.id, u.token_hash]);
    await q('UPDATE recuperacao_senha SET usado = true WHERE usuario_id = $1', [u.id]);
    await auditar(u, 'senha_alterada', null, ip);
    return json({ ok: true, mensagem: 'Senha alterada com sucesso.' });
  });

  r('POST', '/auth/excluir-conta', async ({ req, body, ip }) => {
    const u = await autenticar(req);
    const atual = await q1('SELECT senha_hash FROM usuarios WHERE id = $1', [u.id]);
    if (!confereSenha(body.senha || '', atual.senha_hash)) falha(400, 'Senha incorreta.');
    await q("UPDATE usuarios SET status = 'inativo', exclusao_solicitada_em = now() WHERE id = $1", [u.id]);
    await q('DELETE FROM sessoes WHERE usuario_id = $1', [u.id]);
    await q('DELETE FROM dispositivos WHERE usuario_id = $1', [u.id]);
    await auditar(u, 'exclusao_solicitada', null, ip);
    return json({ ok: true, mensagem: 'Pedido registrado. Sua conta foi desativada e seus dados serão excluídos pelo responsável.' });
  });
}
