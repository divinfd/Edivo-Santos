import 'package:flutter/material.dart';

import '../api.dart';
import '../comum.dart';

class TelaFeedback extends StatelessWidget {
  const TelaFeedback({super.key});

  @override
  Widget build(BuildContext context) => Carregador<List>(
        carregar: () async => List.from(await Api.get('/app/respostas')),
        construir: (context, lista, _) {
          if (lista.isEmpty) return const Vazio(Icons.edit_note, 'Você ainda não enviou nenhuma partilha.\nAbra uma oração em "Minha Oração" e partilhe o que viveu.');
          return ListView(padding: const EdgeInsets.all(16), children: [
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Row(children: [
                Icon(Icons.lock_outline, size: 16, color: Colors.black54),
                SizedBox(width: 6),
                Expanded(child: Text('Suas partilhas são vistas apenas por você e pela equipe vocacional.', style: TextStyle(color: Colors.black54))),
              ]),
            ),
            for (final r in lista)
              Card(
                child: ExpansionTile(
                  shape: const Border(),
                  leading: const Icon(Icons.favorite_outline, color: dourado),
                  title: Text(r['titulo'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${r['categoria'] ?? ''} · ${fmtDataHora(r['enviada_em'])}'),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final i in (r['itens'] as List? ?? []))
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(i['pergunta'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600, color: azulEscuro)),
                          const SizedBox(height: 2),
                          Text(i['valor'] ?? ''),
                        ]),
                      ),
                    if ((r['comentario'] ?? '').toString().isNotEmpty)
                      Padding(padding: const EdgeInsets.only(top: 10), child: Text('Comentário: ${r['comentario']}', style: const TextStyle(fontStyle: FontStyle.italic))),
                  ],
                ),
              ),
          ]);
        },
      );
}
