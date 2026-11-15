// Cria/atualiza as tabelas e o conteúdo inicial.
// Uso: DATABASE_URL=... ADMIN_EMAIL=... ADMIN_NOME=... ADMIN_SENHA=... node scripts/migrar.mjs
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { hashSenha } from '../netlify/lib/core.mjs';
import { CONTEUDO_INICIAL } from './conteudo-inicial.mjs';

const sql = neon(process.env.DATABASE_URL);
const schema = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
for (const cmd of schema.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
  await sql.query(cmd);
}
console.log('Tabelas OK');

const { ADMIN_EMAIL, ADMIN_NOME, ADMIN_SENHA } = process.env;
if (ADMIN_EMAIL && ADMIN_SENHA) {
  const ja = await sql.query('SELECT id FROM usuarios WHERE email = $1', [ADMIN_EMAIL.toLowerCase()]);
  if (!ja.length) {
    await sql.query("INSERT INTO usuarios (nome, email, senha_hash, papel, status) VALUES ($1,$2,$3,'admin','ativo')", [ADMIN_NOME || 'Administrador', ADMIN_EMAIL.toLowerCase(), hashSenha(ADMIN_SENHA)]);
    console.log('Administrador criado:', ADMIN_EMAIL);
  } else console.log('Administrador já existe:', ADMIN_EMAIL);
}

const n = await sql.query('SELECT count(*)::int AS n FROM conteudos');
if (n[0].n === 0) {
  for (const c of CONTEUDO_INICIAL) {
    await sql.query('INSERT INTO conteudos (secao, titulo, texto, ordem, imagem_key) VALUES ($1,$2,$3,$4,$5)', [c.secao, c.titulo, c.texto, c.ordem, c.imagem_key || null]);
  }
  console.log('Conteúdo inicial da Família Guanelliana inserido');
}
const m = await sql.query("SELECT 1 FROM config WHERE chave = 'mensagem_espiritual'");
if (!m.length) {
  await sql.query("INSERT INTO config (chave, valor) VALUES ('mensagem_espiritual', $1)", [JSON.stringify('Você não está sozinho em sua caminhada. Deus caminha com você e nós também.')]);
}
const mes = await sql.query("SELECT 1 FROM config WHERE chave = 'mensagem_espiritual_es'");
if (!mes.length) {
  await sql.query("INSERT INTO config (chave, valor) VALUES ('mensagem_espiritual_es', $1)", [JSON.stringify('No estás solo en tu camino. Dios camina contigo y nosotros también.')]);
}
console.log('Pronto.');
