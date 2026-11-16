import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:uuid/uuid.dart';

import '../api.dart';
import '../comum.dart';
import '../idioma.dart';
import '../pdf.dart';

String rotuloStatus(Map a) {
  if (a['resposta_id'] != null) return 'Partilha enviada';
  if (a['progresso'] == 'concluida') return 'Concluída';
  if (a['progresso'] == 'iniciada') return 'Em andamento';
  return 'Nova';
}

Color corStatus(String s) => switch (s) {
      'Nova' => dourado,
      'Em andamento' => azul,
      _ => Colors.green.shade700,
    };

class TelaOracao extends StatefulWidget {
  const TelaOracao({super.key});
  @override
  State<TelaOracao> createState() => _TelaOracaoEstado();
}

class _TelaOracaoEstado extends State<TelaOracao> {
  String? _categoria;
  String _filtro = 'Todas';
  final _chave = GlobalKey<CarregadorEstado<List>>();

  @override
  Widget build(BuildContext context) {
    return Carregador<List>(
      key: _chave,
      carregar: () async => List.from(await Api.get('/app/atividades')),
      construir: (context, todas, _) {
        final cats = {for (final a in todas) a['categoria'] as String}.toList()..sort();
        final lista = todas.where((a) {
          if (_categoria != null && a['categoria'] != _categoria) return false;
          final s = rotuloStatus(a);
          if (_filtro == 'Pendentes') return s == 'Nova' || s == 'Em andamento';
          if (_filtro == 'Concluídas') return s == 'Concluída' || s == 'Partilha enviada';
          return true;
        }).toList();
        return ListView(padding: const EdgeInsets.all(16), children: [
          SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'Todas', label: Text(tr('Todas'))),
              ButtonSegment(value: 'Pendentes', label: Text(tr('Pendentes'))),
              ButtonSegment(value: 'Concluídas', label: Text(tr('Concluídas'))),
            ],
            selected: {_filtro},
            onSelectionChanged: (s) => setState(() => _filtro = s.first),
          ),
          if (cats.length > 1)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(top: 10),
              child: Row(children: [
                Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(tr('Todas as categorias')), selected: _categoria == null, onSelected: (_) => setState(() => _categoria = null))),
                for (final c in cats)
                  Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(tr(c)), selected: _categoria == c, onSelected: (_) => setState(() => _categoria = c))),
              ]),
            ),
          const SizedBox(height: 8),
          if (lista.isEmpty)
            Padding(
              padding: EdgeInsets.only(top: 60),
              child: Text(tr('Nenhuma oração por aqui ainda.\nQuando a equipe publicar novos materiais, você será avisado.'), textAlign: TextAlign.center, style: TextStyle(color: Colors.black54)),
            ),
          for (final a in lista) _CartaoAtividade(a, aoVoltar: () => _chave.currentState?.recarregar()),
        ]);
      },
    );
  }
}

class _CartaoAtividade extends StatelessWidget {
  final Map a;
  final VoidCallback aoVoltar;
  const _CartaoAtividade(this.a, {required this.aoVoltar});

  @override
  Widget build(BuildContext context) {
    final s = rotuloStatus(a);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () async {
          await Navigator.push(context, MaterialPageRoute(builder: (_) => TelaAtividade(id: a['id'], titulo: a['titulo'])));
          aoVoltar();
        },
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (a['capa_key'] != null)
            Image.network(imagemUrl(a['capa_key']), width: 92, height: 110, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox(width: 0))
          else
            Container(width: 92, height: 110, color: azul.withValues(alpha: 0.08), child: const Icon(Icons.self_improvement, color: azul, size: 36)),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tr(a['categoria'] ?? ''), style: const TextStyle(color: douradoTexto, fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(a['titulo'] ?? '', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: corStatus(s).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                    child: Text(tr(s), style: TextStyle(color: corStatus(s), fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                  if (a['prazo'] != null && a['resposta_id'] == null) Text(tr('Até {d}', {'d': fmtData(a['prazo'])}), style: const TextStyle(fontSize: 12, color: Colors.black54)),
                ]),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class TelaAtividade extends StatefulWidget {
  final int id;
  final String titulo;
  const TelaAtividade({super.key, required this.id, required this.titulo});
  @override
  State<TelaAtividade> createState() => _TelaAtividadeEstado();
}

class _TelaAtividadeEstado extends State<TelaAtividade> {
  final _chave = GlobalKey<CarregadorEstado<Map>>();
  double? _progresso;
  bool _guardado = false, _pendente = false;

  Future<Map> _carregar() async {
    final a = Map.from(await Api.get('/app/atividades/${widget.id}'));
    if (a['arquivo_id'] != null) _guardado = await Pdfs.guardado(a['arquivo_id']);
    _pendente = await Api.estaPendente('/app/atividades/${widget.id}/resposta');
    return a;
  }

  Future<void> _abrirPdf(Map a) async {
    setState(() => _progresso = 0);
    try {
      final f = await Pdfs.abrir(a, progresso: (p) => setState(() => _progresso = p));
      if (a['progresso'] == null) {
        Api.enviarOuGuardar('/app/atividades/${a['id']}/progresso', {'status': 'iniciada'}).catchError((_) => false);
      }
      if (!mounted) return;
      setState(() => _progresso = null);
      await Navigator.push(context, MaterialPageRoute(builder: (_) => TelaPdf(arquivo: f, titulo: a['titulo'])));
      if (!await Pdfs.guardado(a['arquivo_id'])) await Pdfs.descartarTemporario(a['arquivo_id']);
      _chave.currentState?.recarregar();
    } catch (e) {
      if (mounted) {
        setState(() => _progresso = null);
        aviso(context, '$e', erro: true);
      }
    }
  }

  Future<void> _alternarOffline(Map a, bool guardar) async {
    try {
      if (guardar) {
        setState(() => _progresso = 0);
        await Pdfs.guardar(a, progresso: (p) => setState(() => _progresso = p));
      } else {
        await Pdfs.remover(a['arquivo_id']);
      }
      setState(() { _guardado = guardar; _progresso = null; });
      if (mounted) aviso(context, guardar ? tr('Pronto! Você pode ler esta oração sem internet.') : tr('Cópia removida do aparelho.'));
    } catch (e) {
      setState(() => _progresso = null);
      if (mounted) aviso(context, '$e', erro: true);
    }
  }

  Future<void> _compartilhar(Map a) async {
    try {
      final f = await Pdfs.abrir(a);
      await SharePlus.instance.share(ShareParams(files: [XFile(f.path, mimeType: 'application/pdf')], title: a['titulo']));
    } catch (e) {
      if (mounted) aviso(context, '$e', erro: true);
    }
  }

  Future<void> _concluir(Map a) async {
    final ok = await Api.enviarOuGuardar('/app/atividades/${a['id']}/progresso', {'status': 'concluida'});
    if (!mounted) return;
    aviso(context, ok ? tr('Oração marcada como concluída. Que Deus abençoe sua caminhada!') : tr('Sem internet: vamos registrar assim que a conexão voltar.'));
    _chave.currentState?.recarregar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.titulo, overflow: TextOverflow.ellipsis)),
      body: Carregador<Map>(
        key: _chave,
        carregar: _carregar,
        construir: (context, a, recarregar) {
          final temPdf = a['arquivo_id'] != null;
          final perguntas = List<Map>.from(a['perguntas'] ?? []);
          return ListView(padding: const EdgeInsets.all(16), children: [
            if (a['capa_key'] != null)
              ClipRRect(borderRadius: BorderRadius.circular(14), child: Image.network(imagemUrl(a['capa_key']), height: 180, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink())),
            const SizedBox(height: 10),
            Text(tr(a['categoria'] ?? ''), style: const TextStyle(color: douradoTexto, fontWeight: FontWeight.w700)),
            Text(a['titulo'] ?? '', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: azulEscuro)),
            const SizedBox(height: 4),
            Text([
              tr('Publicada em {d}', {'d': fmtData(a['publicar_em'])}),
              if (a['prazo'] != null) tr('partilhar até {d}', {'d': fmtData(a['prazo'])}),
            ].join(' · '), style: const TextStyle(color: Colors.black54)),
            if ((a['descricao'] ?? '').toString().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(a['descricao'], style: const TextStyle(fontSize: 16, height: 1.45))),
            const SizedBox(height: 16),
            if (temPdf) ...[
              if (_progresso != null) ...[LinearProgressIndicator(value: _progresso), const SizedBox(height: 8)],
              FilledButton.icon(
                icon: const Icon(Icons.picture_as_pdf),
                label: Text(tr('Abrir oração')),
                onPressed: _progresso != null ? null : () => _abrirPdf(a),
              ),
              if (a['permitir_offline'] == true)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(tr('Disponível sem internet')),
                  subtitle: Text(tr('Guarda uma cópia neste aparelho')),
                  value: _guardado,
                  onChanged: _progresso != null ? null : (v) => _alternarOffline(a, v),
                ),
              if (a['permitir_download'] == true)
                TextButton.icon(icon: const Icon(Icons.share), label: Text(tr('Salvar ou compartilhar PDF')), onPressed: () => _compartilhar(a)),
            ],
            if (_pendente)
              Card(
                color: Color(0xFFFFF7E0),
                child: ListTile(
                  leading: Icon(Icons.cloud_upload_outlined, color: dourado),
                  title: Text(tr('Sua partilha está guardada no aparelho')),
                  subtitle: Text(tr('Ela será enviada automaticamente quando houver internet.')),
                ),
              )
            else if (a['resposta'] != null)
              _RespostaEnviada(a, perguntas)
            else if (perguntas.isNotEmpty)
              _Formulario(a, perguntas, aoEnviar: recarregar)
            else if (a['progresso'] != 'concluida')
              OutlinedButton.icon(icon: const Icon(Icons.check_circle_outline), label: Text(tr('Marcar como concluída')), onPressed: () => _concluir(a))
            else
              ListTile(leading: Icon(Icons.check_circle, color: Colors.green), title: Text(tr('Você concluiu esta oração.'))),
          ]);
        },
      ),
    );
  }
}

class _RespostaEnviada extends StatelessWidget {
  final Map a;
  final List<Map> perguntas;
  const _RespostaEnviada(this.a, this.perguntas);
  @override
  Widget build(BuildContext context) {
    final r = a['resposta'] as Map;
    final valores = {for (final i in (r['itens'] as List)) i['pergunta_id']: i['valor']};
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Titulo(tr('Sua partilha (enviada em {d})', {'d': fmtDataHora(r['enviada_em'])})),
      for (final p in perguntas)
        Card(
          child: ListTile(title: Text(p['texto'], style: const TextStyle(fontWeight: FontWeight.w600)), subtitle: Text(valores[p['id']]?.toString() ?? '—')),
        ),
      if ((r['comentario'] ?? '').toString().isNotEmpty) Card(child: ListTile(title: Text(tr('Comentário')), subtitle: Text(r['comentario']))),
      Padding(padding: EdgeInsets.only(top: 6), child: Text(tr('Somente você e a equipe vocacional veem esta partilha.'), style: TextStyle(color: Colors.black54))),
    ]);
  }
}

class _Formulario extends StatefulWidget {
  final Map a;
  final List<Map> perguntas;
  final Future<void> Function() aoEnviar;
  const _Formulario(this.a, this.perguntas, {required this.aoEnviar});
  @override
  State<_Formulario> createState() => _FormularioEstado();
}

class _FormularioEstado extends State<_Formulario> {
  final Map<int, String> _v = {};
  final _comentario = TextEditingController();
  final _uuid = const Uuid().v4();
  bool _ocupado = false;

  Widget _campo(Map p) {
    final id = p['id'] as int;
    final opcoes = List.from(p['opcoes'] ?? []);
    switch (p['tipo']) {
      case 'multipla':
        return RadioGroup<String>(
          groupValue: _v[id],
          onChanged: (x) => setState(() => _v[id] = x ?? ''),
          child: Column(children: [for (final o in opcoes) RadioListTile<String>(contentPadding: EdgeInsets.zero, value: '$o', title: Text('$o'))]),
        );
      case 'escala':
        final min = opcoes.length == 2 ? int.parse('${opcoes[0]}') : 1;
        final max = opcoes.length == 2 ? int.parse('${opcoes[1]}') : 5;
        return Wrap(spacing: 8, children: [
          for (var n = min; n <= max; n++)
            ChoiceChip(label: Text('$n'), selected: _v[id] == '$n', onSelected: (_) => setState(() => _v[id] = '$n')),
        ]);
      case 'texto_curto':
        return TextField(onChanged: (x) => _v[id] = x, decoration: InputDecoration(hintText: tr('Sua resposta')));
      default:
        return TextField(onChanged: (x) => _v[id] = x, minLines: 4, maxLines: 10, decoration: InputDecoration(hintText: tr('Escreva com liberdade...')));
    }
  }

  Future<void> _enviar() async {
    for (final p in widget.perguntas) {
      if (p['obrigatoria'] == true && (_v[p['id']] ?? '').trim().isEmpty) {
        aviso(context, tr('Responda: "{p}"').replaceAll('{p}', '${p['texto']}'), erro: true);
        return;
      }
    }
    setState(() => _ocupado = true);
    try {
      final enviado = await Api.enviarOuGuardar('/app/atividades/${widget.a['id']}/resposta', {
        'client_uuid': _uuid,
        'comentario': _comentario.text.trim(),
        'itens': [for (final e in _v.entries) if (e.value.trim().isNotEmpty) {'pergunta_id': e.key, 'valor': e.value.trim()}],
      });
      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (c) => AlertDialog(
          icon: Icon(enviado ? Icons.favorite : Icons.cloud_upload_outlined, color: dourado, size: 40),
          title: Text(enviado ? tr('Partilha recebida!') : tr('Partilha guardada')),
          content: Text(enviado
              ? tr('Obrigado por partilhar sua oração. A equipe vocacional vai ler com carinho. Seguimos caminhando juntos!')
              : tr('Você está sem internet. Sua partilha ficou guardada no aparelho e será enviada automaticamente.')),
          actions: [FilledButton(onPressed: () => Navigator.pop(c), child: Text(tr('Amém')))],
        ),
      );
      await widget.aoEnviar();
    } catch (e) {
      if (mounted) aviso(context, '$e', erro: true);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Titulo(tr('Partilhe sua oração')),
        Text(tr('Responda com sinceridade. Não há respostas certas ou erradas. Somente a equipe vocacional verá.'), style: TextStyle(color: Colors.black54)),
        for (final p in widget.perguntas)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('${p['texto']}${p['obrigatoria'] == true ? ' *' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                if (p['tipo'] == 'escala')
                  Padding(padding: const EdgeInsets.only(top: 2), child: Text(tr('Escolha um número (o menor é "pouco" e o maior é "muito")'), style: TextStyle(color: Colors.grey.shade600, fontSize: 12))),
                const SizedBox(height: 8),
                _campo(p),
              ]),
            ),
          ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: TextField(controller: _comentario, minLines: 2, maxLines: 6, decoration: InputDecoration(labelText: tr('Algo mais que queira partilhar? (opcional)'))),
          ),
        ),
        const SizedBox(height: 8),
        BotaoCarregando(ocupado: _ocupado, texto: tr('Enviar minha partilha'), aoTocar: _enviar),
        const SizedBox(height: 24),
      ]);
}
