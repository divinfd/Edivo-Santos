import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart';

import 'api.dart';
import 'comum.dart';

/// PDFs baixados em partes. Só ficam guardados no aparelho quando a atividade permite uso offline.
class Pdfs {
  static Future<Directory> _dir(bool guardado) async {
    final base = guardado ? await getApplicationDocumentsDirectory() : await getTemporaryDirectory();
    final d = Directory('${base.path}/pdfs');
    await d.create(recursive: true);
    return d;
  }

  static Future<File> _arquivo(int id, bool guardado) async => File('${(await _dir(guardado)).path}/$id.pdf');

  static Future<bool> guardado(int id) async => (await _arquivo(id, true)).exists();

  static Future<File> _baixar(Map a, File destino, void Function(double)? progresso) async {
    final id = a['arquivo_id'] as int;
    final partes = (a['arquivo_partes'] as num?)?.toInt() ?? 1;
    final tmp = File('${destino.path}.baixando');
    final s = tmp.openWrite();
    try {
      for (var i = 0; i < partes; i++) {
        s.add(await Api.bytes('/app/arquivos/$id/partes/$i'));
        progresso?.call((i + 1) / partes);
      }
      await s.close();
    } catch (_) {
      await s.close();
      if (await tmp.exists()) await tmp.delete();
      rethrow;
    }
    return tmp.rename(destino.path);
  }

  /// Devolve o PDF para leitura (cópia guardada ou baixada agora).
  static Future<File> abrir(Map a, {void Function(double)? progresso}) async {
    final id = a['arquivo_id'] as int;
    final g = await _arquivo(id, true);
    if (await g.exists()) return g;
    return _baixar(a, await _arquivo(id, false), progresso);
  }

  static Future<void> guardar(Map a, {void Function(double)? progresso}) async {
    if (a['permitir_offline'] != true) return;
    final id = a['arquivo_id'] as int;
    final g = await _arquivo(id, true);
    if (await g.exists()) return;
    final t = await _arquivo(id, false);
    if (await t.exists()) {
      await t.copy(g.path);
    } else {
      await _baixar(a, g, progresso);
    }
  }

  static Future<void> remover(int id) async {
    for (final g in [true, false]) {
      final f = await _arquivo(id, g);
      if (await f.exists()) await f.delete();
    }
  }

  static Future<void> descartarTemporario(int id) async {
    final f = await _arquivo(id, false);
    if (await f.exists()) await f.delete();
  }
}

class TelaPdf extends StatefulWidget {
  final File arquivo;
  final String titulo;
  const TelaPdf({super.key, required this.arquivo, required this.titulo});
  @override
  State<TelaPdf> createState() => _TelaPdfEstado();
}

class _TelaPdfEstado extends State<TelaPdf> {
  late final PdfControllerPinch _c = PdfControllerPinch(document: PdfDocument.openFile(widget.arquivo.path));
  int _pagina = 1, _total = 0;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF3A3F47),
      appBar: AppBar(title: Text(widget.titulo, overflow: TextOverflow.ellipsis)),
      body: PdfViewPinch(
        controller: _c,
        onDocumentLoaded: (d) => setState(() => _total = d.pagesCount),
        onPageChanged: (p) => setState(() => _pagina = p),
        onDocumentError: (e) => aviso(context, 'Não foi possível abrir o PDF.', erro: true),
      ),
      bottomNavigationBar: _total == 0
          ? null
          : SafeArea(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  IconButton(
                    tooltip: 'Página anterior',
                    icon: const Icon(Icons.chevron_left),
                    onPressed: _pagina > 1 ? () => _c.previousPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut) : null,
                  ),
                  Text('Página $_pagina de $_total  ·  use dois dedos para ampliar', style: const TextStyle(fontSize: 13)),
                  IconButton(
                    tooltip: 'Próxima página',
                    icon: const Icon(Icons.chevron_right),
                    onPressed: _pagina < _total ? () => _c.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut) : null,
                  ),
                ]),
              ),
            ),
    );
  }
}
