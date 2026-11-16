import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Idioma do app: 'es' (principal) ou 'pt'. Os textos do código estão em português e são traduzidos por [tr].
final idioma = ValueNotifier<String>('es');

bool get emEspanhol => idioma.value == 'es';
String get localeData => emEspanhol ? 'es' : 'pt_BR';

Future<void> carregarIdioma() async {
  final p = await SharedPreferences.getInstance();
  idioma.value = p.getString('idioma') == 'pt' ? 'pt' : 'es';
}

Future<void> definirIdioma(String novo) async {
  final p = await SharedPreferences.getInstance();
  await p.setString('idioma', novo);
  idioma.value = novo;
}

/// Traduz um texto em português; `{chave}` é substituído pelos valores de [v].
String tr(String pt, [Map<String, Object?> v = const {}]) {
  var s = pt;
  if (emEspanhol) {
    s = _es[pt] ?? _padrao(pt) ?? pt;
  }
  v.forEach((k, x) => s = s.replaceAll('{$k}', '${x ?? ''}'));
  return s;
}

final _padroes = <RegExp, String Function(Match)>{
  RegExp(r'^Responda: "(.*)"$', dotAll: true): (m) => 'Responde: "${m[1]}"',
  RegExp(r'^Opção inválida em "(.*)"$', dotAll: true): (m) => 'Opción inválida en "${m[1]}"',
  RegExp(r'^Valor inválido em "(.*)"$', dotAll: true): (m) => 'Valor inválido en "${m[1]}"',
  RegExp(r'^Obrigado por partilhar sua oração "(.*)"\. Seguimos caminhando juntos!$', dotAll: true): (m) =>
      'Gracias por compartir tu oración "${m[1]}". ¡Seguimos caminando juntos!',
};

String? _padrao(String pt) {
  for (final e in _padroes.entries) {
    final m = e.key.firstMatch(pt);
    if (m != null) return e.value(m);
  }
  return null;
}

const _es = <String, String>{
  // encontros por vídeo
  'Encontros por vídeo': 'Encuentros por video',
  'Encontro por vídeo': 'Encuentro por video',
  'Chamadas de vídeo com o seu grupo': 'Videollamadas con tu grupo',
  'Nenhum encontro agendado no momento.': 'No hay encuentros programados por ahora.',
  'Quando a equipe marcar um encontro, você recebe um aviso.': 'Cuando el equipo programe un encuentro, recibirás un aviso.',
  '{n} min': '{n} min',
  'Entrar na sala': 'Entrar a la sala',
  'A sala abre às {h}.': 'La sala abre a las {h}.',
  'Câmera e microfone': 'Cámara y micrófono',
  'Para participar da chamada, permita o uso da câmera e do microfone. Você pode desligá-los durante o encontro.': 'Para participar en la llamada, permite el uso de la cámara y el micrófono. Puedes apagarlos durante el encuentro.',
  'Entrar mesmo assim': 'Entrar de todos modos',
  'Abrir configurações': 'Abrir ajustes',
  'Sair do encontro?': '¿Salir del encuentro?',
  'Sair': 'Salir',
  'Continuar': 'Continuar',
  'Encontro acontecendo agora': 'Encuentro en curso ahora',
  'A sala abre 30 minutos antes do encontro.': 'La sala abre 30 minutos antes del encuentro.',
  'Este encontro já terminou.': 'Este encuentro ya terminó.',
  'O limite mensal de minutos de vídeo gratuitos foi atingido. As salas voltam a abrir no início do próximo mês.': 'Se alcanzó el límite mensual de minutos de video gratuitos. Las salas vuelven a abrir a comienzos del próximo mes.',
  'Encontro não encontrado.': 'Encuentro no encontrado.',
  'O serviço de vídeo não respondeu. Tente novamente em instantes.': 'El servicio de video no respondió. Inténtalo de nuevo en unos instantes.',
  'As chamadas de vídeo ainda não foram configuradas no servidor.': 'Las videollamadas aún no fueron configuradas en el servidor.',
  'A sala deste encontro não foi criada.': 'La sala de este encuentro no fue creada.',
  // gerais
  'Sem conexão com a internet.': 'Sin conexión a internet.',
  'Não foi possível concluir (erro {n}).': 'No se pudo completar (error {n}).',
  'Tentar novamente': 'Intentar de nuevo',
  'Não foi possível abrir o PDF.': 'No se pudo abrir el PDF.',
  'Página anterior': 'Página anterior',
  'Página {a} de {b}  ·  use dois dedos para ampliar': 'Página {a} de {b}  ·  usa dos dedos para ampliar',
  'Próxima página': 'Página siguiente',
  'Avisos e orações': 'Avisos y oraciones',
  'Novas orações, lembretes e respostas da equipe vocacional': 'Nuevas oraciones, recordatorios y respuestas del equipo vocacional',
  'Idioma': 'Idioma',
  // conta
  'Avisos': 'Avisos',
  'Nenhum aviso nos últimos 60 dias.': 'Ningún aviso en los últimos 60 días.',
  'Salvar': 'Guardar',
  'Cancelar': 'Cancelar',
  'Minha conta': 'Mi cuenta',
  'Corrigir meus dados': 'Corregir mis datos',
  'Nome completo': 'Nombre completo',
  'Telefone': 'Teléfono',
  'Dados atualizados.': 'Datos actualizados.',
  'Trocar senha': 'Cambiar contraseña',
  'Senha atual': 'Contraseña actual',
  'Nova senha (8+ caracteres, letras e números)': 'Nueva contraseña (8+ caracteres, letras y números)',
  'Senha alterada.': 'Contraseña cambiada.',
  'Política de Privacidade': 'Política de Privacidad',
  'Sair do aplicativo': 'Salir de la aplicación',
  'Excluir minha conta': 'Eliminar mi cuenta',
  'Desativa o acesso e pede a exclusão dos seus dados': 'Desactiva el acceso y solicita la eliminación de tus datos',
  'Digite sua senha para confirmar': 'Escribe tu contraseña para confirmar',
  'Excluir': 'Eliminar',
  'Pedido registrado.': 'Solicitud registrada.',
  'OK': 'OK',
  'Vocacional Hermanas Guanelianas · versão 1.0.0': 'Vocacional Hermanas Guanelianas · versión 1.0.0',
  // contato
  'Dúvida': 'Duda',
  'Orientação vocacional': 'Orientación vocacional',
  'Encontros': 'Encuentros',
  'Mensagem': 'Mensaje',
  'Os dados de contato da equipe vocacional ainda serão informados. Enquanto isso, envie sua mensagem abaixo.':
      'Los datos de contacto del equipo vocacional se informarán pronto. Mientras tanto, envía tu mensaje abajo.',
  'WhatsApp': 'WhatsApp',
  'E-mail': 'Correo electrónico',
  'Escrever para a equipe': 'Escribir al equipo',
  'Minhas mensagens': 'Mis mensajes',
  'Nenhuma mensagem ainda.': 'Todavía no hay mensajes.',
  'Resposta da equipe · {d}': 'Respuesta del equipo · {d}',
  'Aguardando resposta': 'Esperando respuesta',
  'Mensagem enviada! A equipe responderá em breve.': '¡Mensaje enviado! El equipo responderá pronto.',
  'Sem internet: sua mensagem será enviada assim que a conexão voltar.': 'Sin internet: tu mensaje se enviará cuando vuelva la conexión.',
  'Assunto': 'Asunto',
  'Sua mensagem': 'Tu mensaje',
  'Enviar': 'Enviar',
  // entrada
  'Sua sessão terminou. Entre novamente.': 'Tu sesión terminó. Inicia sesión de nuevo.',
  'Esta conta é da equipe. Use o painel web para acessar.': 'Esta cuenta es del equipo. Usa el panel web para acceder.',
  'Você não está sozinho em sua caminhada.': 'No estás solo en tu camino.',
  'Senha': 'Contraseña',
  'Entrar': 'Entrar',
  'Esqueci minha senha': 'Olvidé mi contraseña',
  'Criar minha conta': 'Crear mi cuenta',
  'Informe sua data de nascimento.': 'Indica tu fecha de nacimiento.',
  'As senhas não conferem.': 'Las contraseñas no coinciden.',
  'Cadastro enviado': 'Registro enviado',
  'Aguarde a aprovação.': 'Espera la aprobación.',
  'Telefone (opcional)': 'Teléfono (opcional)',
  'Data de nascimento': 'Fecha de nacimiento',
  'Toque para escolher': 'Toca para elegir',
  'Pelo menos 8 caracteres, com letras e números': 'Al menos 8 caracteres, con letras y números',
  'Repita a senha': 'Repite la contraseña',
  'Você tem menos de 18 anos': 'Tienes menos de 18 años',
  'Precisamos da autorização do seu pai, mãe ou responsável legal. A equipe poderá confirmar com ele(a).':
      'Necesitamos la autorización de tu padre, madre o tutor legal. El equipo podrá confirmarlo con él o ella.',
  'Nome do responsável legal': 'Nombre del tutor legal',
  'Telefone ou e-mail do responsável': 'Teléfono o correo del tutor',
  'Meu responsável legal está ciente e autoriza meu cadastro e participação.': 'Mi tutor legal está informado y autoriza mi registro y participación.',
  'Li e aceito a Política de Privacidade.': 'He leído y acepto la Política de Privacidad.',
  'Ler a política': 'Leer la política',
  'Enviar cadastro': 'Enviar registro',
  'Seu cadastro será aprovado pela equipe vocacional antes do primeiro acesso.': 'Tu registro será aprobado por el equipo vocacional antes del primer acceso.',
  'Senha alterada!': '¡Contraseña cambiada!',
  'Recuperar senha': 'Recuperar contraseña',
  'Seu e-mail': 'Tu correo electrónico',
  'Código recebido por e-mail': 'Código recibido por correo',
  'Nova senha': 'Nueva contraseña',
  'Criar nova senha': 'Crear nueva contraseña',
  'Enviar código': 'Enviar código',
  'Recebi uma senha nova da equipe — voltar para entrar': 'Recibí una contraseña nueva del equipo — volver para entrar',
  // família
  'Família Guanelliana': 'Familia Guaneliana',
  'Em breve': 'Próximamente',
  '{n} conteúdo(s)': '{n} contenido(s)',
  'Assistir ao vídeo': 'Ver el video',
  'São Luís Guanella': 'San Luis Guanella',
  'A Congregação': 'La Congregación',
  'A Clara Providência': 'La Clara Providencia',
  'Carisma Guanelliano': 'Carisma Guaneliano',
  // feedback
  'Você ainda não enviou nenhuma partilha.\nAbra uma oração em "Minha Oração" e partilhe o que viveu.':
      'Todavía no enviaste ninguna reflexión.\nAbre una oración en "Mi Oración" y comparte lo que viviste.',
  'Suas partilhas são vistas apenas por você e pela equipe vocacional.': 'Tus reflexiones solo las ven tú y el equipo vocacional.',
  'Comentário: {c}': 'Comentario: {c}',
  // início
  'Início': 'Inicio',
  'Liturgia diária': 'Liturgia diaria',
  'Minha Oração': 'Mi Oración',
  'Meu Feedback': 'Mi Feedback',
  'Contato': 'Contacto',
  '1 envio aguardando internet. Ele será enviado automaticamente.': '1 envío esperando internet. Se enviará automáticamente.',
  '{n} envios aguardando internet. Serão enviados automaticamente.': '{n} envíos esperando internet. Se enviarán automáticamente.',
  'Tentar agora': 'Intentar ahora',
  'Liturgia': 'Liturgia',
  'Oração': 'Oración',
  'Feedback': 'Feedback',
  'Bom dia': 'Buenos días',
  'Boa tarde': 'Buenas tardes',
  'Boa noite': 'Buenas noches',
  'Leituras e Evangelho do dia': 'Lecturas y Evangelio del día',
  'Orações e materiais para você': 'Oraciones y materiales para ti',
  'São Luís Guanella e o carisma': 'San Luis Guanella y el carisma',
  'O que você partilhou': 'Lo que compartiste',
  'Fale com a equipe vocacional': 'Habla con el equipo vocacional',
  'Há 1 nova oração para você': 'Hay 1 nueva oración para ti',
  'Há {n} novas orações para você': 'Hay {n} nuevas oraciones para ti',
  'Você não está sozinho em sua caminhada. Deus caminha com você e nós também.': 'No estás solo en tu camino. Dios camina contigo y nosotros también.',
  // liturgia
  'Opção {n}': 'Opción {n}',
  'Dia anterior': 'Día anterior',
  'Próximo dia': 'Día siguiente',
  'Cor litúrgica: {c}': 'Color litúrgico: {c}',
  'Santo do dia: {s}': 'Santo del día: {s}',
  'Primeira Leitura': 'Primera Lectura',
  'Salmo Responsorial': 'Salmo Responsorial',
  'Segunda Leitura': 'Segunda Lectura',
  'Evangelho': 'Evangelio',
  'Reflexão': 'Reflexión',
  'Fonte: {f}': 'Fuente: {f}',
  'revisado pela equipe vocacional': 'revisado por el equipo vocacional',
  'Os textos das leituras vêm da fonte em português.': 'Los textos de las lecturas vienen de la fuente en portugués.',
  'Tempo Comum': 'Tiempo Ordinario',
  'Tempo Pascal': 'Tiempo Pascual',
  'Tempo da Quaresma': 'Tiempo de Cuaresma',
  'Tempo do Advento': 'Tiempo de Adviento',
  'Tempo do Natal': 'Tiempo de Navidad',
  'Tríduo Pascal': 'Triduo Pascual',
  'Verde': 'Verde',
  'Roxo': 'Morado',
  'Branco': 'Blanco',
  'Vermelho': 'Rojo',
  'Rosa': 'Rosa',
  'Preto': 'Negro',
  // oração
  'Partilha enviada': 'Reflexión enviada',
  'Concluída': 'Concluida',
  'Em andamento': 'En curso',
  'Nova': 'Nueva',
  'Todas': 'Todas',
  'Pendentes': 'Pendientes',
  'Concluídas': 'Concluidas',
  'Todas as categorias': 'Todas las categorías',
  'Nenhuma oração por aqui ainda.\nQuando a equipe publicar novos materiais, você será avisado.':
      'Todavía no hay oraciones aquí.\nCuando el equipo publique nuevos materiales, recibirás un aviso.',
  'Até {d}': 'Hasta el {d}',
  'Pronto! Você pode ler esta oração sem internet.': '¡Listo! Puedes leer esta oración sin internet.',
  'Cópia removida do aparelho.': 'Copia eliminada del dispositivo.',
  'Oração marcada como concluída. Que Deus abençoe sua caminhada!': 'Oración marcada como concluida. ¡Que Dios bendiga tu camino!',
  'Sem internet: vamos registrar assim que a conexão voltar.': 'Sin internet: lo registraremos cuando vuelva la conexión.',
  'Publicada em {d}': 'Publicada el {d}',
  'partilhar até {d}': 'compartir hasta el {d}',
  'Abrir oração': 'Abrir oración',
  'Disponível sem internet': 'Disponible sin internet',
  'Guarda uma cópia neste aparelho': 'Guarda una copia en este dispositivo',
  'Salvar ou compartilhar PDF': 'Guardar o compartir PDF',
  'Sua partilha está guardada no aparelho': 'Tu reflexión está guardada en el dispositivo',
  'Ela será enviada automaticamente quando houver internet.': 'Se enviará automáticamente cuando haya internet.',
  'Marcar como concluída': 'Marcar como concluida',
  'Você concluiu esta oração.': 'Concluiste esta oración.',
  'Sua partilha (enviada em {d})': 'Tu reflexión (enviada el {d})',
  'Comentário': 'Comentario',
  'Somente você e a equipe vocacional veem esta partilha.': 'Solo tú y el equipo vocacional ven esta reflexión.',
  'Sua resposta': 'Tu respuesta',
  'Escreva com liberdade...': 'Escribe con libertad...',
  'Partilha recebida!': '¡Reflexión recibida!',
  'Partilha guardada': 'Reflexión guardada',
  'Obrigado por partilhar sua oração. A equipe vocacional vai ler com carinho. Seguimos caminhando juntos!':
      'Gracias por compartir tu oración. El equipo vocacional la leerá con cariño. ¡Seguimos caminando juntos!',
  'Você está sem internet. Sua partilha ficou guardada no aparelho e será enviada automaticamente.':
      'Estás sin internet. Tu reflexión quedó guardada en el dispositivo y se enviará automáticamente.',
  'Amém': 'Amén',
  'Partilhe sua oração': 'Comparte tu oración',
  'Responda com sinceridade. Não há respostas certas ou erradas. Somente a equipe vocacional verá.':
      'Responde con sinceridad. No hay respuestas correctas o incorrectas. Solo el equipo vocacional lo verá.',
  'Escolha um número (o menor é "pouco" e o maior é "muito")': 'Elige un número (el menor es "poco" y el mayor es "mucho")',
  'Algo mais que queira partilhar? (opcional)': '¿Algo más que quieras compartir? (opcional)',
  'Enviar minha partilha': 'Enviar mi reflexión',
  // categorias (vindas do servidor)
  'Orações semanais': 'Oraciones semanales',
  'Meditações': 'Meditaciones',
  'Encontros vocacionais': 'Encuentros vocacionales',
  'Reflexões bíblicas': 'Reflexiones bíblicas',
  'Espiritualidade guanelliana': 'Espiritualidad guaneliana',
  'Exercícios de discernimento': 'Ejercicios de discernimiento',
  'Retiros e atividades especiais': 'Retiros y actividades especiales',
  // avisos automáticos (vindos do servidor)
  'Uma nova oração foi publicada': 'Se publicó una nueva oración',
  'Você recebeu uma resposta': 'Recibiste una respuesta',
  'Sua atividade foi recebida': 'Tu actividad fue recibida',
  // mensagens do servidor
  'A senha atual está incorreta.': 'La contraseña actual es incorrecta.',
  'A senha precisa ter pelo menos 8 caracteres, com letras e números.': 'La contraseña debe tener al menos 8 caracteres, con letras y números.',
  'Arquivo não encontrado.': 'Archivo no encontrado.',
  'Atividade não encontrada.': 'Actividad no encontrada.',
  'Código inválido ou expirado.': 'Código inválido o vencido.',
  'Data de nascimento inválida.': 'Fecha de nacimiento inválida.',
  'E-mail ou senha incorretos.': 'Correo o contraseña incorrectos.',
  'Escreva sua mensagem.': 'Escribe tu mensaje.',
  'Este acesso é exclusivo dos responsáveis vocacionais.': 'Este acceso es exclusivo de los responsables vocacionales.',
  'Este e-mail já está cadastrado. Use "Esqueci minha senha" se precisar.': 'Este correo ya está registrado. Usa "Olvidé mi contraseña" si lo necesitas.',
  'Faça login para continuar.': 'Inicia sesión para continuar.',
  'Informe o nome completo.': 'Indica tu nombre completo.',
  'Informe seu nome completo.': 'Indica tu nombre completo.',
  'Informe um e-mail válido.': 'Indica un correo válido.',
  'Muitas tentativas. Aguarde 15 minutos e tente novamente.': 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.',
  'Não foi possível carregar a liturgia deste dia. Tente novamente mais tarde.': 'No se pudo cargar la liturgia de este día. Inténtalo más tarde.',
  'Para menores de 18 anos é necessária a autorização do responsável legal.': 'Para menores de 18 años se necesita la autorización del tutor legal.',
  'Para menores de 18 anos, informe o nome e o contato (telefone ou e-mail) do pai, mãe ou responsável legal.':
      'Para menores de 18 años, indica el nombre y el contacto (teléfono o correo) del padre, madre o tutor legal.',
  'Parte do arquivo não encontrada.': 'Parte del archivo no encontrada.',
  'Senha incorreta.': 'Contraseña incorrecta.',
  'Seu cadastro foi recebido e aguarda a aprovação do responsável vocacional.': 'Tu registro fue recibido y espera la aprobación del responsable vocacional.',
  'Sua conta está desativada. Fale com o responsável vocacional.': 'Tu cuenta está desactivada. Habla con el responsable vocacional.',
  'Sua conta não está ativa. Fale com o responsável vocacional.': 'Tu cuenta no está activa. Habla con el responsable vocacional.',
  'Sua sessão expirou. Entre novamente.': 'Tu sesión expiró. Inicia sesión de nuevo.',
  'Você já enviou sua resposta para esta atividade.': 'Ya enviaste tu respuesta para esta actividad.',
  'É preciso aceitar a Política de Privacidade.': 'Es necesario aceptar la Política de Privacidad.',
  'Cadastro enviado! Assim que o responsável vocacional aprovar, você poderá entrar.': '¡Registro enviado! Cuando el responsable vocacional lo apruebe, podrás entrar.',
  'Se o e-mail estiver cadastrado, enviaremos um código. Se ele não chegar, o responsável vocacional também foi avisado e pode criar uma senha nova para você.':
      'Si el correo está registrado, enviaremos un código. Si no llega, el responsable vocacional también fue avisado y puede crear una contraseña nueva para ti.',
  'Senha alterada! Entre com a nova senha.': '¡Contraseña cambiada! Entra con la nueva contraseña.',
  'Senha alterada com sucesso.': 'Contraseña cambiada con éxito.',
  'Pedido registrado. Sua conta foi desativada e seus dados serão excluídos pelo responsável.':
      'Solicitud registrada. Tu cuenta fue desactivada y el responsable eliminará tus datos.',
};
