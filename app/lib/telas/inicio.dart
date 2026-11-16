import 'package:flutter/material.dart';

import '../api.dart';
import '../comum.dart';
import '../idioma.dart';
import '../push.dart';
import 'conta.dart';
import 'contato.dart';
import 'encontros.dart';
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
      case 'encontro':
        Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaEncontros()));
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
        backgroundColor: _aba == 0 ? Colors.white : null,
        title: _aba == 0
            ? Image.asset('assets/logo_topo.png', height: 40, semanticLabel: 'Vocacional Hermanas Guanelianas')
            : Text(tr(_titulos[_aba]), style: const TextStyle(fontSize: 20)),
        actions: [
          IconButton(tooltip: tr('Avisos'), icon: const Icon(Icons.notifications_outlined), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaAvisos()))),
          IconButton(tooltip: tr('Minha conta'), icon: const Icon(Icons.account_circle_outlined), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaConta()))),
        ],
      ),
      body: Column(children: [
        ValueListenableBuilder<int>(
          valueListenable: Api.pendentes,
          builder: (_, n, _) => n == 0
              ? const SizedBox.shrink()
              : MaterialBanner(
                  backgroundColor: const Color(0xFFFFF7E0),
                  content: Text(n == 1 ? tr('1 envio aguardando internet. Ele será enviado automaticamente.') : tr('{n} envios aguardando internet. Serão enviados automaticamente.', {'n': n})),
                  leading: const Icon(Icons.cloud_upload_outlined, color: dourado),
                  actions: [TextButton(onPressed: Api.sincronizar, child: Text(tr('Tentar agora')))],
                ),
        ),
        Expanded(child: paginas[_aba]),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: irPara,
        destinations: [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: tr('Início')),
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: tr('Liturgia')),
          NavigationDestination(icon: Icon(Icons.self_improvement_outlined), selectedIcon: Icon(Icons.self_improvement), label: tr('Oração')),
          NavigationDestination(icon: Icon(Icons.edit_note_outlined), selectedIcon: Icon(Icons.edit_note), label: tr('Feedback')),
          NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: tr('Contato')),
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
        final saudacao = hora < 12 ? tr('Bom dia') : (hora < 18 ? tr('Boa tarde') : tr('Boa noite'));
        final novas = (d['novas_atividades'] ?? 0) as int;
        final mensagemEs = (d['mensagem_espiritual_es'] ?? '').toString();
        final mensagem = emEspanhol && mensagemEs.isNotEmpty ? mensagemEs : tr((d['mensagem_espiritual'] ?? '').toString());
        final modulos = [
          (Icons.menu_book, tr('Liturgia diária'), tr('Leituras e Evangelho do dia'), () => irPara(1)),
          (Icons.self_improvement, tr('Minha Oração'), tr('Orações e materiais para você'), () => irPara(2)),
          (Icons.videocam, tr('Encontros por vídeo'), tr('Chamadas de vídeo com o seu grupo'), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaEncontros()))),
          (Icons.diversity_3, tr('Família Guanelliana'), tr('São Luís Guanella e o carisma'), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaFamilia()))),
          (Icons.edit_note, tr('Meu Feedback'), tr('O que você partilhou'), () => irPara(3)),
          (Icons.forum, tr('Contato'), tr('Fale com a equipe vocacional'), () => irPara(4)),
        ];
        return ListView(padding: const EdgeInsets.all(16), children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(colors: [azul, azulEscuro]),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$saudacao, $primeiro!', style: const TextStyle(color: dourado, fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(fmtDataLonga(DateTime.now()), style: const TextStyle(color: Colors.white70)),
              if (mensagem.isNotEmpty) ...[
                const SizedBox(height: 14),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.format_quote, color: dourado),
                  const SizedBox(width: 6),
                  Expanded(child: Text(mensagem, style: const TextStyle(color: Colors.white, fontSize: 16, fontStyle: FontStyle.italic, height: 1.35))),
                ]),
              ],
            ]),
          ),
          if (d['encontro_aberto'] is Map)
            Card(
              color: dourado,
              child: ListTile(
                leading: const Icon(Icons.videocam, color: azulEscuro),
                title: Text(tr('Encontro acontecendo agora'), style: const TextStyle(fontWeight: FontWeight.w700, color: azulEscuro)),
                subtitle: Text((d['encontro_aberto']['titulo'] ?? '').toString(), style: const TextStyle(color: azulEscuro)),
                trailing: FilledButton(onPressed: () => entrarNoEncontro(context, d['encontro_aberto']['id'] as int), child: Text(tr('Entrar'))),
              ),
            ),
          if (novas > 0)
            Card(
              color: const Color(0xFFFFF7E0),
              child: ListTile(
                leading: const Icon(Icons.auto_awesome, color: dourado),
                title: Text(novas == 1 ? tr('Há 1 nova oração para você') : tr('Há {n} novas orações para você', {'n': novas})),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => irPara(2),
              ),
            ),
          const SizedBox(height: 6),
          for (final m in modulos)
            Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                leading: CircleAvatar(backgroundColor: dourado, child: Icon(m.$1, color: azulEscuro)),
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
