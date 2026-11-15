-- Vocacional Hermanas Guanelianas - esquema do banco (PostgreSQL / Neon)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('admin','responsavel','jovem')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','ativo','inativo')),
  data_nascimento DATE,
  telefone TEXT,
  responsavel_legal_nome TEXT,
  responsavel_legal_contato TEXT,
  consentimento_declarado_em TIMESTAMPTZ,
  consentimento_confirmado_em TIMESTAMPTZ,
  consentimento_confirmado_por INT,
  exclusao_solicitada_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS grupos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grupo_membros (
  grupo_id INT NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (grupo_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS grupo_responsaveis (
  grupo_id INT NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (grupo_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  origem TEXT NOT NULL DEFAULT 'app',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS recuperacao_senha (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash TEXT,
  expira_em TIMESTAMPTZ,
  usado BOOLEAN NOT NULL DEFAULT false,
  email_enviado BOOLEAN NOT NULL DEFAULT false,
  atendido BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arquivos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  tamanho INT NOT NULL,
  partes INT NOT NULL,
  partes_recebidas INT NOT NULL DEFAULT 0,
  completo BOOLEAN NOT NULL DEFAULT false,
  criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atividades (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL,
  capa_key TEXT,
  arquivo_id INT REFERENCES arquivos(id) ON DELETE SET NULL,
  publicar_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  prazo DATE,
  permitir_download BOOLEAN NOT NULL DEFAULT false,
  permitir_offline BOOLEAN NOT NULL DEFAULT true,
  para_todos BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicada','arquivada')),
  notificado_em TIMESTAMPTZ,
  criado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atividade_grupos (
  atividade_id INT NOT NULL REFERENCES atividades(id) ON DELETE CASCADE,
  grupo_id INT NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  PRIMARY KEY (atividade_id, grupo_id)
);

CREATE TABLE IF NOT EXISTS perguntas (
  id SERIAL PRIMARY KEY,
  atividade_id INT NOT NULL REFERENCES atividades(id) ON DELETE CASCADE,
  ordem INT NOT NULL DEFAULT 0,
  texto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('texto_longo','texto_curto','multipla','escala')),
  opcoes JSONB NOT NULL DEFAULT '[]',
  obrigatoria BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS progresso (
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  atividade_id INT NOT NULL REFERENCES atividades(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('iniciada','concluida')),
  iniciada_em TIMESTAMPTZ,
  concluida_em TIMESTAMPTZ,
  PRIMARY KEY (usuario_id, atividade_id)
);

CREATE TABLE IF NOT EXISTS respostas (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  atividade_id INT NOT NULL REFERENCES atividades(id) ON DELETE CASCADE,
  client_uuid TEXT UNIQUE,
  enviada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  lida_em TIMESTAMPTZ,
  UNIQUE (usuario_id, atividade_id)
);

CREATE TABLE IF NOT EXISTS resposta_itens (
  resposta_id INT NOT NULL REFERENCES respostas(id) ON DELETE CASCADE,
  pergunta_id INT NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE,
  valor TEXT,
  PRIMARY KEY (resposta_id, pergunta_id)
);

CREATE TABLE IF NOT EXISTS observacoes (
  id SERIAL PRIMARY KEY,
  jovem_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  autor_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  resposta_id INT REFERENCES respostas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conteudos (
  id SERIAL PRIMARY KEY,
  secao TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  imagem_key TEXT,
  video_url TEXT,
  ordem INT NOT NULL DEFAULT 0,
  publicado BOOLEAN NOT NULL DEFAULT true,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS liturgia (
  data DATE PRIMARY KEY,
  conteudo JSONB NOT NULL,
  fonte TEXT,
  manual BOOLEAN NOT NULL DEFAULT false,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por INT REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS mensagens (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('duvida','orientacao','encontros','mensagem')),
  texto TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  resposta TEXT,
  respondida_em TIMESTAMPTZ,
  respondida_por INT REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL,
  para_todos BOOLEAN NOT NULL DEFAULT false,
  grupos INT[] NOT NULL DEFAULT '{}',
  usuarios INT[] NOT NULL DEFAULT '{}',
  atividade_id INT REFERENCES atividades(id) ON DELETE SET NULL,
  enviada_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
  dispositivos INT NOT NULL DEFAULT 0,
  entregues INT NOT NULL DEFAULT 0,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispositivos (
  token TEXT PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  detalhe JSONB,
  ip TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_respostas_atividade ON respostas(atividade_id);
CREATE INDEX IF NOT EXISTS idx_respostas_usuario ON respostas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_atividades_status ON atividades(status, publicar_em);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(criado_em);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

ALTER TABLE atividades ADD COLUMN IF NOT EXISTS notificar BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS comentario TEXT;

ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS client_uuid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_client_uuid ON mensagens (usuario_id, client_uuid);
