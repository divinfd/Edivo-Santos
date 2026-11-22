import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'api.dart';
import 'idioma.dart';
import 'comum.dart';
import 'push.dart';
import 'telas/entrada.dart';
import 'telas/inicio.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('pt_BR');
  await initializeDateFormatting('es');
  await carregarIdioma();
  await Api.carregar();
  await iniciarPush();
  Api.aoExpirar = () => navKey.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const TelaLogin(expirou: true)), (_) => false);
  runApp(const AppVocacional());
}

class AppVocacional extends StatelessWidget {
  const AppVocacional({super.key});
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<String>(
        valueListenable: idioma,
        builder: (_, lang, _) => MaterialApp(
        key: ValueKey(lang),
        title: 'Vocacional Hermanas Guanelianas',
        debugShowCheckedModeBanner: false,
        navigatorKey: navKey,
        theme: tema(),
        locale: lang == 'pt' ? const Locale('pt', 'BR') : const Locale('es'),
        supportedLocales: const [Locale('es'), Locale('pt', 'BR')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        home: Api.token == null ? const TelaLogin() : const TelaPrincipal(),
      ),
      );
}
