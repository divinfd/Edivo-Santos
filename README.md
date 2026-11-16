# Vocacional Hermanas Guanelianas

Plataforma de acompanhamento vocacional inspirada no carisma de São Luís Guanella:
aplicativo Android para os jovens + painel web para a equipe vocacional, com servidor e banco de dados próprios.

| Parte | Onde está | Tecnologia |
|---|---|---|
| Aplicativo Android | `app/` | Flutter |
| Painel administrativo | `web/src/` → https://vocacional-guanelianas.netlify.app/painel | React + Vite |
| Servidor (API) | `web/netlify/` → https://vocacional-guanelianas.netlify.app/api | Netlify Functions |
| Banco de dados | `web/db/schema.sql` | Neon PostgreSQL |
| PDFs e fotos (privados) | Netlify Blobs | — |
| Notificações | Firebase Cloud Messaging (HTTP v1) | — |
| Liturgia diária | https://liturgia.up.railway.app/v2/ (com correção manual no painel) | — |

Documentação:
- [Instalação e publicação técnica](docs/INSTALACAO.md)
- [Manual do painel (para a equipe)](docs/MANUAL_PAINEL.md)
- [Guia de publicação na Google Play](docs/PLAY_STORE.md)

Política de privacidade publicada: https://vocacional-guanelianas.netlify.app/privacidade.html
(modelo inicial — revisar com a congregação antes da publicação na loja).
