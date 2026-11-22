import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../api.dart';
import '../comum.dart';
import '../idioma.dart';

class TelaEncontros extends StatelessWidget {
  const TelaEncontros({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tr('Encontros por vídeo'))),
      body: Carregador<List>(
        carregar: () async => List.from(await Api.get('/app/encontros', cache: false)),
        construir: (context, lista, recarregar) => RefreshIndicator(
          onRefresh: recarregar,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            if (lista.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Column(children: [
                  const Icon(Icons.videocam_outlined, size: 64, color: azul),
                  const SizedBox(height: 12),
                  Text(tr('Nenhum encontro agendado no momento.'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
                  const SizedBox(height: 6),
                  Text(tr('Quando a equipe marcar um encontro, você recebe um aviso.'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54)),
                ]),
              ),
            for (final e in lista) _CartaoEncontro(e: Map.from(e), recarregar: recarregar),
          ]),
        ),
      ),
    );
  }
}

class _CartaoEncontro extends StatelessWidget {
  final Map e;
  final Future<void> Function() recarregar;
  const _CartaoEncontro({required this.e, required this.recarregar});

  @override
  Widget build(BuildContext context) {
    final inicio = DateTime.parse(e['inicio']).toLocal();
    final aberto = e['situacao'] == 'aberto';
    final abre = inicio.subtract(const Duration(minutes: 30));
    final quando = DateFormat("EEEE, d MMM · HH:mm", localeData).format(inicio);
    return Card(
      color: aberto ? const Color(0xFFFFF7E0) : null,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(backgroundColor: dourado, child: Icon(aberto ? Icons.videocam : Icons.event, color: azulEscuro)),
            const SizedBox(width: 12),
            Expanded(child: Text((e['titulo'] ?? '').toString(), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
          ]),
          const SizedBox(height: 10),
          Text('${quando[0].toUpperCase()}${quando.substring(1)}  ·  ${tr('{n} min', {'n': e['duracao_min']})}'),
          if ((e['descricao'] ?? '').toString().isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(e['descricao'].toString(), style: const TextStyle(color: Colors.black54)),
          ],
          const SizedBox(height: 12),
          if (aberto)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                icon: const Icon(Icons.video_call),
                label: Text(tr('Entrar na sala')),
                onPressed: () => entrarNoEncontro(context, e['id'] as int).then((_) => recarregar()),
              ),
            )
          else
            Text(tr('A sala abre às {h}.', {'h': DateFormat('HH:mm').format(abre)}), style: const TextStyle(color: azul, fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}

Future<void> entrarNoEncontro(BuildContext context, int id) async {
  final permissoes = await [Permission.camera, Permission.microphone].request();
  if (!context.mounted) return;
  if (permissoes.values.any((s) => !s.isGranted)) {
    final ir = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(tr('Câmera e microfone')),
        content: Text(tr('Para participar da chamada, permita o uso da câmera e do microfone. Você pode desligá-los durante o encontro.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('Entrar mesmo assim'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr('Abrir configurações'))),
        ],
      ),
    );
    if (ir == true) {
      await openAppSettings();
      return;
    }
    if (!context.mounted) return;
  }
  try {
    final r = Map.from(await Api.post('/app/encontros/$id/entrar', {'idioma': idioma.value}));
    if (!context.mounted) return;
    final url = '${r['url']}?t=${Uri.encodeQueryComponent(r['token'])}';
    await Navigator.push(context, MaterialPageRoute(builder: (_) => TelaChamada(url: url)));
  } catch (e) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
  }
}

class TelaChamada extends StatefulWidget {
  final String url;
  const TelaChamada({super.key, required this.url});
  @override
  State<TelaChamada> createState() => _TelaChamadaEstado();
}

class _TelaChamadaEstado extends State<TelaChamada> {
  late final WebViewController _web;
  bool _carregando = true;

  @override
  void initState() {
    super.initState();
    _web = WebViewController(onPermissionRequest: (p) => p.grant())
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _carregando = false);
        },
        onNavigationRequest: (n) {
          final host = Uri.tryParse(n.url)?.host ?? '';
          return host.endsWith('daily.co') ? NavigationDecision.navigate : NavigationDecision.prevent;
        },
      ));
    final plataforma = _web.platform;
    if (plataforma is AndroidWebViewController) plataforma.setMediaPlaybackRequiresUserGesture(false);
    _web.loadRequest(Uri.parse(widget.url));
  }

  Future<bool> _confirmarSaida() async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(tr('Sair do encontro?')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('Continuar'))),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr('Sair'))),
          ],
        ),
      ) ??
      false;

  Future<void> _sair() async {
    if (await _confirmarSaida() && mounted) {
      await _web.loadRequest(Uri.parse('about:blank'));
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (saiu, _) {
        if (!saiu) _sair();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          title: Text(tr('Encontro por vídeo')),
          leading: IconButton(icon: const Icon(Icons.close), tooltip: tr('Sair'), onPressed: _sair),
        ),
        body: Stack(children: [
          WebViewWidget(controller: _web),
          if (_carregando) const Center(child: CircularProgressIndicator(color: dourado)),
        ]),
      ),
    );
  }
}
