import 'package:flutter/material.dart';

import '../api.dart';
import '../comum.dart';
import '../idioma.dart';

class TelaLiturgia extends StatefulWidget {
  const TelaLiturgia({super.key});
  @override
  State<TelaLiturgia> createState() => _TelaLiturgiaEstado();
}

class _TelaLiturgiaEstado extends State<TelaLiturgia> {
  DateTime _dia = DateTime.now();

  String get _iso => '${_dia.year}-${_dia.month.toString().padLeft(2, '0')}-${_dia.day.toString().padLeft(2, '0')}';

  Color _cor(String c) {
    final s = c.toLowerCase();
    if (s.contains('verde')) return Colors.green.shade700;
    if (s.contains('roxo') || s.contains('violeta')) return Colors.purple.shade700;
    if (s.contains('vermelho')) return Colors.red.shade700;
    if (s.contains('rosa')) return Colors.pink.shade300;
    if (s.contains('branco')) return Colors.grey.shade300;
    return dourado;
  }

  Widget _leituras(String titulo, List itens) {
    if (itens.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Titulo(titulo),
      for (var i = 0; i < itens.length; i++)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (itens.length > 1) Text(tr('Opção {n}', {'n': i + 1}), style: const TextStyle(color: douradoTexto, fontWeight: FontWeight.w700)),
              if ((itens[i]['referencia'] ?? '').isNotEmpty) Text(itens[i]['referencia'], style: const TextStyle(fontWeight: FontWeight.w700, color: azul)),
              if ((itens[i]['titulo'] ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(itens[i]['titulo'], style: const TextStyle(fontStyle: FontStyle.italic))),
              if ((itens[i]['refrao'] ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('R. ${itens[i]['refrao']}', style: const TextStyle(fontWeight: FontWeight.w600))),
              const SizedBox(height: 8),
              SelectableText(itens[i]['texto'] ?? '', style: const TextStyle(fontSize: 16, height: 1.5)),
            ]),
          ),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Material(
        color: Colors.white,
        child: Row(children: [
          IconButton(tooltip: tr('Dia anterior'), icon: const Icon(Icons.chevron_left), onPressed: () => setState(() => _dia = _dia.subtract(const Duration(days: 1)))),
          Expanded(
            child: TextButton.icon(
              icon: const Icon(Icons.calendar_month, size: 18),
              label: Text(fmtDataLonga(_dia), textAlign: TextAlign.center),
              onPressed: () async {
                final d = await showDatePicker(context: context, initialDate: _dia, firstDate: DateTime(2020), lastDate: DateTime(DateTime.now().year + 1, 12, 31));
                if (d != null) setState(() => _dia = d);
              },
            ),
          ),
          IconButton(tooltip: tr('Próximo dia'), icon: const Icon(Icons.chevron_right), onPressed: () => setState(() => _dia = _dia.add(const Duration(days: 1)))),
        ]),
      ),
      Expanded(
        child: Carregador<Map>(
          key: ValueKey('$_iso-${idioma.value}'),
          carregar: () async => Map.from(await Api.get('/app/liturgia?data=$_iso&idioma=${idioma.value}')),
          construir: (context, l, _) => ListView(padding: const EdgeInsets.all(16), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if ((l['titulo'] ?? '').isNotEmpty) Text(l['titulo'], style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: azulEscuro)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    if ((l['tempo'] ?? '').isNotEmpty) Chip(label: Text(tr(l['tempo'])), visualDensity: VisualDensity.compact),
                    if ((l['cor'] ?? '').isNotEmpty)
                      Chip(avatar: CircleAvatar(backgroundColor: _cor(l['cor'])), label: Text(tr('Cor litúrgica: {c}', {'c': tr(l['cor'])})), visualDensity: VisualDensity.compact),
                  ]),
                  if ((l['santo'] ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(tr('Santo do dia: {s}', {'s': l['santo']}))),
                ]),
              ),
            ),
            _leituras(tr('Primeira Leitura'), l['primeira_leitura'] ?? []),
            _leituras(tr('Salmo Responsorial'), l['salmo'] ?? []),
            _leituras(tr('Segunda Leitura'), l['segunda_leitura'] ?? []),
            _leituras(tr('Evangelho'), l['evangelho'] ?? []),
            if ((l['reflexao'] ?? '').isNotEmpty) ...[
              Titulo(tr('Reflexão')),
              Card(child: Padding(padding: const EdgeInsets.all(16), child: SelectableText(l['reflexao'], style: const TextStyle(fontSize: 16, height: 1.5)))),
            ],
            const SizedBox(height: 12),
            if (emEspanhol && l['idioma'] != 'es') Text(tr('Os textos das leituras vêm da fonte em português.'), style: const TextStyle(color: Colors.black45, fontSize: 12)),
            Text(tr('Fonte: {f}', {'f': l['manual'] == true ? tr('revisado pela equipe vocacional') : (l['fonte'] ?? '')}), style: const TextStyle(color: Colors.black45, fontSize: 12)),
          ]),
        ),
      ),
    ]);
  }
}
