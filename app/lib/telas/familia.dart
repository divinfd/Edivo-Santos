import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import '../api.dart';
import '../comum.dart';
import '../idioma.dart';

class TelaFamilia extends StatelessWidget {
  const TelaFamilia({super.key});
  static const _icones = {'guanella': Icons.person, 'congregacao': Icons.church, 'providencia': Icons.volunteer_activism, 'carisma': Icons.favorite};

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(tr('Família Guanelliana'))),
        body: Carregador<List>(
          carregar: () async => List.from(await Api.get('/app/familia?idioma=${idioma.value}')),
          construir: (context, secoes, _) => ListView(padding: const EdgeInsets.all(16), children: [
            for (final s in secoes)
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  leading: CircleAvatar(backgroundColor: dourado.withValues(alpha: 0.2), child: Icon(_icones[s['chave']] ?? Icons.star, color: azul)),
                  title: Text(tr(s['nome']), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text((s['itens'] as List).isEmpty ? tr('Em breve') : tr('{n} conteúdo(s)', {'n': (s['itens'] as List).length})),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: (s['itens'] as List).isEmpty ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => _TelaSecao(s))),
                ),
              ),
          ]),
        ),
      );
}

class _TelaSecao extends StatelessWidget {
  final Map secao;
  const _TelaSecao(this.secao);

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(secao['nome'])),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          for (final c in secao['itens'])
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (c['imagem_key'] != null)
                  Image.network(imagemUrl(c['imagem_key']), fit: BoxFit.cover, height: 260, errorBuilder: (_, _, _) => const SizedBox.shrink()),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(c['titulo'] ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: azulEscuro)),
                    const SizedBox(height: 8),
                    SelectableText(c['texto'] ?? '', style: const TextStyle(fontSize: 16, height: 1.5)),
                  ]),
                ),
                if ((c['video_url'] ?? '').toString().isNotEmpty) _Video(c['video_url']),
              ]),
            ),
        ]),
      );
}

class _Video extends StatefulWidget {
  final String url;
  const _Video(this.url);
  @override
  State<_Video> createState() => _VideoEstado();
}

class _VideoEstado extends State<_Video> {
  YoutubePlayerController? _c;

  @override
  void initState() {
    super.initState();
    final id = YoutubePlayerController.convertUrlToId(widget.url);
    if (id != null) _c = YoutubePlayerController.fromVideoId(videoId: id, params: const YoutubePlayerParams(showFullscreenButton: true));
  }

  @override
  void dispose() {
    _c?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_c != null) return YoutubePlayer(controller: _c!);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: OutlinedButton.icon(
        icon: const Icon(Icons.play_circle_outline),
        label: Text(tr('Assistir ao vídeo')),
        onPressed: () => launchUrl(Uri.parse(widget.url), mode: LaunchMode.externalApplication),
      ),
    );
  }
}
