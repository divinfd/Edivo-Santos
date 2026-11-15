import 'package:flutter/material.dart';

import '../api.dart';
import '../comum.dart';
import '../push.dart';
import 'conta.dart';
import 'contato.dart';
import 'familia.dart';
import 'feedback.dart';
import 'liturgia.dart';
import 'oracao.dart';

class TelaPrincipal extends StatefulWidget {
  const TelaPrincipal({super.key});
  @override
  State<TelaPrincipal> createState() => _TelaPrincipalEstado();
}

class _TelaPrincipalEstado extends State<TelaPrincipal> {
  int _aba = 0;
  int _rodada = 0;
  int _pendentesAntes = Api.pendentes.value;
  static const _titulos = ['Início', 'Liturgia diária', 'Minha Oração', 'Meu Feedback', 'Contato'];

  @override
  void initState() {
    super.initState();
    registrarDispositivo();
    Api.sincronizar();
    aberturaPush.addListener(_abrirPush);
    Api.pendentes.addListener(_aoSincronizar);
    WidgetsBinding.instance.addPostFrameCallback((_) => _abrirPush());
  }

  @override
  void dispose() {
    aberturaPush.removeListener(_abrirPush);
    Api.pendentes.removeListener(_aoSincronizar);
    super.dispose();
  }

  void _aoSincronizar() {
    final n = Api.pendentes.value;
    if (n < _pendentesAntes && mounted) setState(() => _rodada++);
    _pendentesAntes = n;
  }

  void _abrirPush() {
    final t = aberturaPush.value;
    if (t == null || !mounted) return;
    aberturaPush.value = null;
    switch (t) {
      case 'atividade':
        setState(() => _aba = 2);
      case 'recebida':
        setState(() => _aba = 3);
      case 'mensagem':
        setState(() => _aba = 4);
      default:
        Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaAvisos()));
    }
  }

  void irPara(int aba) => setState(() => _aba = aba);

  @override
  Widget build(BuildContext context) {
    final paginas = [
      _Inicio(irPara: irPara, key: ValueKey('inicio$_rodada')),
      TelaLiturgia(key: ValueKey('liturgia$_rodada')),
      TelaOracao(key: ValueKey('oracao$_rodada')),
      TelaFeedback(key: ValueKey('feedback$_rodada')),
      TelaContato(key: ValueKey('contato$_rodada')),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_aba == 0 ? 'Vocacional Hermanas Guanelianas' : _titulos[_aba], style: TextStyle(fontSize: _aba == 0 ? 17 : 20)),
        actions: [
          IconButton(tooltip: 'Avisos', icon: const Icon(Icons.notifications_outlined), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaAvisos()))),
          IconButton(tooltip: 'Minha conta', icon: const Icon(Icons.account_circle_outlined), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaConta()))),
        ],
      ),
      body: Column(children: [
        ValueListenableBuilder<int>(
          valueListenable: Api.pendentes,
          builder: (_, n, _) => n == 0
              ? const SizedBox.shrink()
              : MaterialBanner(
                  backgroundColor: const Color(0xFFFFF7E0),
                  content: Text(n == 1 ? '1 envio aguardando internet. Ele será enviado automaticamente.' : '$n envios aguardando internet. Serão enviados automaticamente.'),
                  leading: const Icon(Icons.cloud_upload_outlined, color: dourado),
                  actions: [TextButton(onPressed: Api.sincronizar, child: const Text('Tentar agora'))],
                ),
        ),
        Expanded(child: paginas[_aba]),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: irPara,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Início'),
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Liturgia'),
          NavigationDestination(icon: Icon(Icons.self_improvement_outlined), selectedIcon: Icon(Icons.self_improvement), label: 'Oração'),
          NavigationDestination(icon: Icon(Icons.edit_note_outlined), selectedIcon: Icon(Icons.edit_note), label: 'Feedback'),
          NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: 'Contato'),
        ],
      ),
    );
  }
}

class _Inicio extends StatelessWidget {
  final void Function(int) irPara;
  const _Inicio({required this.irPara, super.key});

  @override
  Widget build(BuildContext context) {
    return Carregador<Map>(
      carregar: () async => Map.from(await Api.get('/app/inicio')),
      construir: (context, d, _) {
        final primeiro = (d['nome'] ?? '').toString().split(' ').first;
        final hora = DateTime.now().hour;
        final saudacao = hora < 12 ? 'Bom dia' : (hora < 18 ? 'Boa tarde' : 'Boa noite');
        final novas = (d['novas_atividades'] ?? 0) as int;
        final modulos = [
          (Icons.menu_book, 'Liturgia diária', 'Leituras e Evangelho do dia', () => irPara(1)),
          (Icons.self_improvement, 'Minha Oração', 'Orações e materiais para você', () => irPara(2)),
          (Icons.diversity_3, 'Família Guanelliana', 'São Luís Guanella e o carisma', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaFamilia()))),
          (Icons.edit_note, 'Meu Feedback', 'O que você partilhou', () => irPara(3)),
          (Icons.forum, 'Contato', 'Fale com a equipe vocacional', () => irPara(4)),
        ];
        return ListView(padding: const EdgeInsets.all(16), children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(colors: [azul, azulEscuro]),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$saudacao, $primeiro!', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(fmtDataLonga(DateTime.now()), style: const TextStyle(color: Colors.white70)),
              if ((d['mensagem_espiritual'] ?? '').toString().isNotEmpty) ...[
                const SizedBox(height: 14),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.format_quote, color: dourado),
                  const SizedBox(width: 6),
                  Expanded(child: Text(d['mensagem_espiritual'], style: const TextStyle(color: Colors.white, fontSize: 16, fontStyle: FontStyle.italic, height: 1.35))),
                ]),
              ],
            ]),
          ),
          if (novas > 0)
            Card(
              color: const Color(0xFFFFF7E0),
              child: ListTile(
                leading: const Icon(Icons.auto_awesome, color: dourado),
                title: Text(novas == 1 ? 'Há 1 nova oração para você' : 'Há $novas novas orações para você'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => irPara(2),
              ),
            ),
          const SizedBox(height: 6),
          for (final m in modulos)
            Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                leading: CircleAvatar(backgroundColor: azul.withValues(alpha: 0.1), child: Icon(m.$1, color: azul)),
                title: Text(m.$2, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(m.$3),
                trailing: const Icon(Icons.chevron_right),
                onTap: m.$4,
              ),
            ),
        ]);
      },
    );
  }
}
