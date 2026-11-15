import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

import '../api.dart';
import '../comum.dart';

const tiposMensagem = {'duvida': 'Dúvida', 'orientacao': 'Orientação vocacional', 'encontros': 'Encontros', 'mensagem': 'Mensagem'};

class TelaContato extends StatefulWidget {
  const TelaContato({super.key});
  @override
  State<TelaContato> createState() => _TelaContatoEstado();
}

class _TelaContatoEstado extends State<TelaContato> {
  final _chave = GlobalKey<CarregadorEstado<List>>();

  Future<List> _carregar() async {
    final c = await Api.get('/app/contato');
    final m = await Api.get('/app/mensagens');
    return [c, m];
  }

  void _abrir(String url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context) => Carregador<List>(
        key: _chave,
        carregar: _carregar,
        construir: (context, d, recarregar) {
          final c = Map.from(d[0] ?? {});
          final msgs = List.from(d[1] ?? []);
          String s(String k) => (c[k] ?? '').toString().trim();
          final digitos = s('whatsapp').replaceAll(RegExp(r'\D'), '');
          final vazio = ['nome', 'telefone', 'whatsapp', 'email', 'apresentacao', 'encontros'].every((k) => s(k).isEmpty);
          return ListView(padding: const EdgeInsets.all(16), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (vazio) const Text('Os dados de contato da equipe vocacional ainda serão informados. Enquanto isso, envie sua mensagem abaixo.'),
                  if (s('nome').isNotEmpty) Text(s('nome'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: azulEscuro)),
                  if (s('apresentacao').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(s('apresentacao'))),
                  const SizedBox(height: 8),
                  if (s('whatsapp').isNotEmpty)
                    ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.chat, color: Colors.green), title: const Text('WhatsApp'), subtitle: Text(s('whatsapp')),
                        onTap: () => _abrir('https://wa.me/${digitos.length <= 11 ? '55$digitos' : digitos}')),
                  if (s('telefone').isNotEmpty)
                    ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.phone, color: azul), title: const Text('Telefone'), subtitle: Text(s('telefone')),
                        onTap: () => _abrir('tel:${s('telefone').replaceAll(RegExp(r'[^\d+]'), '')}')),
                  if (s('email').isNotEmpty)
                    ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.email, color: azul), title: const Text('E-mail'), subtitle: Text(s('email')), onTap: () => _abrir('mailto:${s('email')}')),
                  if (s('encontros').isNotEmpty) ...[
                    const Divider(),
                    const Text('Encontros', style: TextStyle(fontWeight: FontWeight.w700)),
                    Text(s('encontros')),
                  ],
                ]),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              icon: const Icon(Icons.edit),
              label: const Text('Escrever para a equipe'),
              onPressed: () async {
                final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (_) => const _NovaMensagem());
                if (ok == true) recarregar();
              },
            ),
            const Titulo('Minhas mensagens'),
            if (msgs.isEmpty) const Text('Nenhuma mensagem ainda.', style: TextStyle(color: Colors.black54)),
            for (final m in msgs)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${tiposMensagem[m['tipo']] ?? 'Mensagem'} · ${fmtDataHora(m['criado_em'])}', style: const TextStyle(color: dourado, fontWeight: FontWeight.w700, fontSize: 12)),
                    const SizedBox(height: 4),
                    Text(m['texto'] ?? ''),
                    const SizedBox(height: 8),
                    if (m['resposta'] != null)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: azul.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(10)),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Resposta da equipe · ${fmtDataHora(m['respondida_em'])}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: azul)),
                          const SizedBox(height: 4),
                          Text(m['resposta']),
                        ]),
                      )
                    else
                      const Text('Aguardando resposta', style: TextStyle(color: Colors.black45, fontStyle: FontStyle.italic)),
                  ]),
                ),
              ),
          ]);
        },
      );
}

class _NovaMensagem extends StatefulWidget {
  const _NovaMensagem();
  @override
  State<_NovaMensagem> createState() => _NovaMensagemEstado();
}

class _NovaMensagemEstado extends State<_NovaMensagem> {
  String _tipo = 'duvida';
  final _texto = TextEditingController();
  final _uuid = const Uuid().v4();
  bool _ocupado = false;

  Future<void> _enviar() async {
    setState(() => _ocupado = true);
    try {
      final ok = await Api.enviarOuGuardar('/app/mensagens', {'tipo': _tipo, 'texto': _texto.text.trim(), 'client_uuid': _uuid});
      if (!mounted) return;
      aviso(context, ok ? 'Mensagem enviada! A equipe responderá em breve.' : 'Sem internet: sua mensagem será enviada assim que a conexão voltar.');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) aviso(context, '$e', erro: true);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Escrever para a equipe', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _tipo,
            decoration: const InputDecoration(labelText: 'Assunto'),
            items: [for (final e in tiposMensagem.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _tipo = v ?? 'mensagem'),
          ),
          const SizedBox(height: 12),
          TextField(controller: _texto, minLines: 4, maxLines: 8, decoration: const InputDecoration(labelText: 'Sua mensagem')),
          const SizedBox(height: 12),
          BotaoCarregando(ocupado: _ocupado, texto: 'Enviar', aoTocar: _enviar),
        ]),
      );
}
