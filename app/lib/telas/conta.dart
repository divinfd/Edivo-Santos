import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../comum.dart';
import '../idioma.dart';
import '../push.dart';
import 'entrada.dart';

class TelaAvisos extends StatelessWidget {
  const TelaAvisos({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(tr('Avisos'))),
        body: Carregador<List>(
          carregar: () async => List.from(await Api.get('/app/avisos')),
          construir: (context, lista, _) => lista.isEmpty
              ? Vazio(Icons.notifications_none, tr('Nenhum aviso nos últimos 60 dias.'))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  for (final n in lista)
                    Card(
                      child: ListTile(
                        leading: Icon(n['atividade_id'] != null ? Icons.self_improvement : Icons.campaign_outlined, color: azul),
                        title: Text(tr(n['titulo'] ?? ''), style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${tr(n['corpo'] ?? '')}\n${fmtDataHora(n['criada_em'])}'),
                        isThreeLine: true,
                      ),
                    ),
                ]),
        ),
      );
}

class TelaConta extends StatefulWidget {
  const TelaConta({super.key});
  @override
  State<TelaConta> createState() => _TelaContaEstado();
}

class _TelaContaEstado extends State<TelaConta> {
  Future<String?> _pedir(String titulo, List<(String, bool)> campos, {String botao = 'Salvar', List<String>? iniciais}) async {
    final cs = [for (var i = 0; i < campos.length; i++) TextEditingController(text: iniciais != null ? iniciais[i] : '')];
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(titulo),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          for (var i = 0; i < campos.length; i++)
            Padding(padding: const EdgeInsets.only(bottom: 10), child: TextField(controller: cs[i], obscureText: campos[i].$2, decoration: InputDecoration(labelText: campos[i].$1))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tr('Cancelar'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tr(botao))),
        ],
      ),
    );
    return ok == true ? cs.map((c) => c.text).join('\u0000') : null;
  }

  Future<void> _executar(Future<void> Function() f) async {
    try {
      await f();
    } catch (e) {
      if (mounted) aviso(context, '$e', erro: true);
    }
  }

  void _irLogin() => Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const TelaLogin()), (_) => false);

  @override
  Widget build(BuildContext context) {
    final u = Api.usuario ?? {};
    return Scaffold(
      appBar: AppBar(title: Text(tr('Minha conta'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: ListTile(
            leading: const CircleAvatar(backgroundColor: azul, child: Icon(Icons.person, color: Colors.white)),
            title: Text(u['nome'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(u['email'] ?? ''),
          ),
        ),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: Text(tr('Corrigir meus dados')),
              onTap: () => _executar(() async {
                final r = await _pedir(tr('Corrigir meus dados'), [(tr('Nome completo'), false), (tr('Telefone'), false)], iniciais: [u['nome'] ?? '', u['telefone'] ?? '']);
                if (r == null) return;
                final p = r.split('\u0000');
                final novo = await Api.req('PUT', '/auth/eu', corpo: {'nome': p[0].trim(), 'telefone': p[1].trim()});
                await Api.salvarSessao(Api.token!, Map<String, dynamic>.from(novo));
                setState(() {});
                if (mounted) aviso(this.context, tr('Dados atualizados.'));
              }),
            ),
            ListTile(
              leading: const Icon(Icons.lock_outline),
              title: Text(tr('Trocar senha')),
              onTap: () => _executar(() async {
                final r = await _pedir(tr('Trocar senha'), [(tr('Senha atual'), true), (tr('Nova senha (8+ caracteres, letras e números)'), true)]);
                if (r == null) return;
                final p = r.split('\u0000');
                final d = await Api.post('/auth/senha', {'atual': p[0], 'nova': p[1]});
                if (mounted) aviso(this.context, d['mensagem'] ?? tr('Senha alterada.'));
              }),
            ),
            ListTile(
              leading: const Icon(Icons.translate),
              title: Text(tr('Idioma')),
              trailing: SeletorIdioma(aoMudar: registrarDispositivo),
            ),
            ListTile(
              leading: const Icon(Icons.privacy_tip_outlined),
              title: Text(tr('Política de Privacidade')),
              onTap: () => launchUrl(Uri.parse('$baseSite/privacidade.html'), mode: LaunchMode.externalApplication),
            ),
          ]),
        ),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.logout, color: azul),
              title: Text(tr('Sair do aplicativo')),
              onTap: () => _executar(() async {
                try {
                  await Api.post('/auth/sair', {if (tokenDispositivo != null) 'dispositivo': tokenDispositivo});
                } catch (_) {}
                await Api.limparSessao();
                _irLogin();
              }),
            ),
            ListTile(
              leading: Icon(Icons.delete_outline, color: Colors.red.shade700),
              title: Text(tr('Excluir minha conta'), style: TextStyle(color: Colors.red.shade700)),
              subtitle: Text(tr('Desativa o acesso e pede a exclusão dos seus dados')),
              onTap: () => _executar(() async {
                final r = await _pedir(tr('Excluir minha conta'), [(tr('Digite sua senha para confirmar'), true)], botao: tr('Excluir'));
                if (r == null) return;
                final d = await Api.post('/auth/excluir-conta', {'senha': r});
                await Api.limparSessao();
                if (!mounted) return;
                await showDialog(
                  context: this.context,
                  builder: (c) => AlertDialog(content: Text(d['mensagem'] ?? tr('Pedido registrado.')), actions: [TextButton(onPressed: () => Navigator.pop(c), child: Text(tr('OK')))]),
                );
                _irLogin();
              }),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        Text(tr('Vocacional Hermanas Guanelianas · versão 1.1.0'), textAlign: TextAlign.center, style: TextStyle(color: Colors.black45)),
      ]),
    );
  }
}
