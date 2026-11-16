# Instalação e publicação técnica

## 1. Servidor e painel (Netlify)

Variáveis de ambiente do site no Netlify (Site configuration → Environment variables):

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Endereço do banco Neon (banco `vocacional`) |
| `FCM_PROJECT`, `FCM_EMAIL`, `FCM_KEY` | Projeto, e-mail e chave privada da conta de serviço do Firebase (notificações) |
| `BREVO_API_KEY` *(opcional)* | Envio do código de recuperação de senha por e-mail |
| `EMAIL_REMETENTE`, `EMAIL_NOME` *(opcional)* | Remetente dos e-mails |

Sem o Brevo, os pedidos de recuperação de senha aparecem no painel (Visão geral) e o responsável define uma senha temporária.

Publicar:

```bash
cd web
npm install
npm run build
DATABASE_URL=... ADMIN_EMAIL=... ADMIN_NOME=... ADMIN_SENHA=... npm run migrar   # cria/atualiza tabelas e o 1º administrador
netlify deploy --prod --dir dist --functions netlify/functions
```

`npm run migrar` pode ser rodado de novo a qualquer momento: ele só cria o que falta.

Teste completo da API (cria e apaga dados de teste `@exemplo.test`):

```bash
ADMIN_EMAIL=... ADMIN_SENHA=... python3 tests/teste_api.py qualquer.pdf
```

## 2. Aplicativo Android (Flutter)

Requisitos: Flutter 3.38+ e Android SDK com a plataforma 37.

```bash
cd app
flutter pub get
flutter analyze
flutter build apk --release        # APK para instalar direto no celular
flutter build appbundle --release  # .aab para a Google Play
```

- Endereço do servidor: `lib/api.dart` (`baseSite`).
- Firebase: `android/app/google-services.json` (projeto `es-messenger-8d377`, pacote `com.hermanasguanelianas.vocacional`).
- Assinatura: `android/key.properties` + arquivo `.jks` (NÃO ficam no GitHub). Guarde-os com cuidado:
  sem eles não é possível publicar atualizações na Google Play.

`android/key.properties`:

```
storePassword=...
keyPassword=...
keyAlias=vocacional
storeFile=/caminho/para/vocacional.jks
```

## 3. Recursos do aplicativo

Login, cadastro (menores de 18 anos exigem nome/contato e autorização do responsável legal, e a conta só é liberada após aprovação no painel), recuperação de senha,
Início, Liturgia diária (com calendário), Minha Oração (PDF dentro do app com zoom, cópia offline opcional, perguntas e envio da partilha),
Meu Feedback (histórico privado), Família Guanelliana, Contato/mensagens com a equipe, Avisos, Minha conta (dados, troca de senha, sair, excluir conta).

Sem internet: o app mostra a última cópia salva das telas e guarda partilhas, mensagens e conclusões numa fila,
que é enviada sozinha quando a conexão volta (sem duplicar no servidor).
