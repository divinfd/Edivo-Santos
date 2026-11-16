# Publicação na Google Play

1. Criar a conta de desenvolvedor em https://play.google.com/console (taxa única de US$ 25). Para organizações, a Google pede dados da entidade (D-U-N-S).
2. **Criar app** → nome: *Vocacional Hermanas Guanelianas*, idioma Português (Brasil), tipo App, gratuito.
3. **Assinatura**: usar o "Play App Signing" (padrão) e enviar o arquivo `app-release.aab`, que já está assinado com a chave de upload (`vocacional.jks`). Guarde a chave e as senhas: todas as atualizações precisam dela.
4. **Ficha da loja**: descrição curta e completa, ícone 512×512, gráfico de destaque 1024×500, ao menos 2 capturas de tela do celular.
5. **Política de privacidade**: https://vocacional-guanelianas.netlify.app/privacidade.html (revisar o texto antes).
6. **Conteúdo do app**:
   - Público-alvo: o app pode ser usado por adolescentes; declarar as faixas etárias reais. Se incluir menores de 13 anos, a Política para Famílias se aplica.
   - Segurança dos dados: declarar coleta de nome, e-mail, telefone, data de nascimento, mensagens e respostas; criptografados em trânsito; o usuário pode pedir exclusão; sem compartilhamento com terceiros para publicidade.
   - Anúncios: não contém.
   - Acesso ao app: o app exige login — fornecer uma conta de teste para a revisão da Google.
7. **Teste fechado**: contas pessoais novas precisam de um teste fechado com pelo menos 12 testadores por 14 dias antes de liberar a produção.
8. Enviar para revisão (costuma levar de alguns dias a uma semana).

Atualizações: aumentar `version:` em `app/pubspec.yaml` (ex.: `1.0.1+2`), gerar novo `.aab` e enviar em uma nova versão.
