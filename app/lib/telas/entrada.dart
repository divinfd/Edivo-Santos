import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../comum.dart';
import '../push.dart';
import 'inicio.dart';

class _Fundo extends StatelessWidget {
  final List<Widget> filhos;
  const _Fundo(this.filhos);
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          decoration: const BoxDecoration(gradient: LinearGradient(colors: [azul, azulEscuro], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: filhos),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _Cabecalho extends StatelessWidget {
  final String subtitulo;
  const _Cabecalho(this.subtitulo);
  @override
  Widget build(BuildContext context) => Column(children: [
        ClipRRect(borderRadius: BorderRadius.circular(18), child: Image.asset('assets/icone.png', width: 84, height: 84)),
        const SizedBox(height: 12),
        const Text('Vocacional Hermanas Guanelianas', textAlign: TextAlign.center, style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: azulEscuro)),
        const SizedBox(height: 4),
        Text(subtitulo, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 18),
      ]);
}

class TelaLogin extends StatefulWidget {
  final bool expirou;
  const TelaLogin({super.key, this.expirou = false});
  @override
  State<TelaLogin> createState() => _TelaLoginEstado();
}

class _TelaLoginEstado extends State<TelaLogin> {
  final _email = TextEditingController(), _senha = TextEditingController();
  bool _ocupado = false, _ver = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    if (widget.expirou) _erro = 'Sua sessão terminou. Entre novamente.';
  }

  Future<void> _entrar() async {
    setState(() { _ocupado = true; _erro = null; });
    try {
      final r = await Api.post('/auth/login', {'email': _email.text.trim(), 'senha': _senha.text, 'origem': 'app'});
      if (r['usuario']['papel'] != 'jovem') throw ErroApi('Esta conta é da equipe. Use o painel web para acessar.');
      await Api.salvarSessao(r['token'], Map<String, dynamic>.from(r['usuario']));
      registrarDispositivo();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const TelaPrincipal()), (_) => false);
    } catch (e) {
      setState(() => _erro = '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) => _Fundo([
        const _Cabecalho('Você não está sozinho em sua caminhada.'),
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], decoration: const InputDecoration(labelText: 'E-mail')),
        const SizedBox(height: 12),
        TextField(
          controller: _senha,
          obscureText: !_ver,
          onSubmitted: (_) => _entrar(),
          decoration: InputDecoration(
            labelText: 'Senha',
            suffixIcon: IconButton(icon: Icon(_ver ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _ver = !_ver)),
          ),
        ),
        if (_erro != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_erro!, style: TextStyle(color: Colors.red.shade700))),
        const SizedBox(height: 16),
        BotaoCarregando(ocupado: _ocupado, texto: 'Entrar', aoTocar: _entrar),
        TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaRecuperar())), child: const Text('Esqueci minha senha')),
        const Divider(),
        OutlinedButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TelaCadastro())), child: const Text('Criar minha conta')),
      ]);
}

class TelaCadastro extends StatefulWidget {
  const TelaCadastro({super.key});
  @override
  State<TelaCadastro> createState() => _TelaCadastroEstado();
}

class _TelaCadastroEstado extends State<TelaCadastro> {
  final _nome = TextEditingController(), _email = TextEditingController(), _tel = TextEditingController();
  final _senha = TextEditingController(), _senha2 = TextEditingController();
  final _legalNome = TextEditingController(), _legalContato = TextEditingController();
  DateTime? _nasc;
  bool _privacidade = false, _consentimento = false, _ocupado = false;
  String? _erro;

  int? get _idade {
    if (_nasc == null) return null;
    final h = DateTime.now();
    var i = h.year - _nasc!.year;
    if (h.month < _nasc!.month || (h.month == _nasc!.month && h.day < _nasc!.day)) i--;
    return i;
  }

  bool get _menor => (_idade ?? 99) < 18;

  Future<void> _enviar() async {
    setState(() => _erro = null);
    if (_nasc == null) return setState(() => _erro = 'Informe sua data de nascimento.');
    if (_senha.text != _senha2.text) return setState(() => _erro = 'As senhas não conferem.');
    setState(() => _ocupado = true);
    try {
      final d = _nasc!;
      final r = await Api.post('/auth/cadastro', {
        'nome': _nome.text.trim(),
        'email': _email.text.trim(),
        'telefone': _tel.text.trim(),
        'senha': _senha.text,
        'data_nascimento': '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}',
        'aceite_privacidade': _privacidade,
        if (_menor) 'responsavel_legal_nome': _legalNome.text.trim(),
        if (_menor) 'responsavel_legal_contato': _legalContato.text.trim(),
        if (_menor) 'consentimento_responsavel': _consentimento,
      });
      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Cadastro enviado'),
          content: Text(r['mensagem'] ?? 'Aguarde a aprovação.'),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
        ),
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _erro = '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const esp = SizedBox(height: 12);
    return Scaffold(
      appBar: AppBar(title: const Text('Criar minha conta')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        TextField(controller: _nome, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nome completo')),
        esp,
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'E-mail')),
        esp,
        TextField(controller: _tel, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Telefone (opcional)')),
        esp,
        InkWell(
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: _nasc ?? DateTime(DateTime.now().year - 16),
              firstDate: DateTime(1930),
              lastDate: DateTime.now(),
              helpText: 'Data de nascimento',
            );
            if (d != null) setState(() => _nasc = d);
          },
          child: InputDecorator(
            decoration: const InputDecoration(labelText: 'Data de nascimento', suffixIcon: Icon(Icons.calendar_month)),
            child: Text(_nasc == null ? 'Toque para escolher' : '${_nasc!.day.toString().padLeft(2, '0')}/${_nasc!.month.toString().padLeft(2, '0')}/${_nasc!.year}'),
          ),
        ),
        esp,
        TextField(controller: _senha, obscureText: true, decoration: const InputDecoration(labelText: 'Senha', helperText: 'Pelo menos 8 caracteres, com letras e números')),
        esp,
        TextField(controller: _senha2, obscureText: true, decoration: const InputDecoration(labelText: 'Repita a senha')),
        if (_nasc != null && _menor) ...[
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFFFF7E0), borderRadius: BorderRadius.circular(12), border: Border.all(color: dourado)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Você tem menos de 18 anos', style: TextStyle(fontWeight: FontWeight.w700)),
              const Text('Precisamos da autorização do seu pai, mãe ou responsável legal. A equipe poderá confirmar com ele(a).'),
              esp,
              TextField(controller: _legalNome, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nome do responsável legal')),
              esp,
              TextField(controller: _legalContato, decoration: const InputDecoration(labelText: 'Telefone ou e-mail do responsável')),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _consentimento,
                onChanged: (v) => setState(() => _consentimento = v ?? false),
                title: const Text('Meu responsável legal está ciente e autoriza meu cadastro e participação.'),
              ),
            ]),
          ),
        ],
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _privacidade,
          onChanged: (v) => setState(() => _privacidade = v ?? false),
          title: const Text('Li e aceito a Política de Privacidade.'),
          subtitle: GestureDetector(
            onTap: () => launchUrl(Uri.parse('$baseSite/privacidade.html'), mode: LaunchMode.externalApplication),
            child: const Text('Ler a política', style: TextStyle(color: azul, decoration: TextDecoration.underline)),
          ),
        ),
        if (_erro != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_erro!, style: TextStyle(color: Colors.red.shade700))),
        BotaoCarregando(ocupado: _ocupado, texto: 'Enviar cadastro', aoTocar: _enviar),
        const SizedBox(height: 8),
        const Text('Seu cadastro será aprovado pela equipe vocacional antes do primeiro acesso.', textAlign: TextAlign.center, style: TextStyle(color: Colors.black54)),
      ]),
    );
  }
}

class TelaRecuperar extends StatefulWidget {
  const TelaRecuperar({super.key});
  @override
  State<TelaRecuperar> createState() => _TelaRecuperarEstado();
}

class _TelaRecuperarEstado extends State<TelaRecuperar> {
  final _email = TextEditingController(), _codigo = TextEditingController(), _nova = TextEditingController();
  bool _pedido = false, _ocupado = false;
  String? _msg, _erro;

  Future<void> _acao() async {
    setState(() { _ocupado = true; _erro = null; });
    try {
      if (!_pedido) {
        final r = await Api.post('/auth/esqueci', {'email': _email.text.trim()});
        setState(() { _pedido = true; _msg = r['mensagem']; });
      } else {
        final r = await Api.post('/auth/redefinir', {'email': _email.text.trim(), 'codigo': _codigo.text.trim(), 'nova_senha': _nova.text});
        if (!mounted) return;
        aviso(context, r['mensagem'] ?? 'Senha alterada!');
        Navigator.pop(context);
      }
    } catch (e) {
      setState(() => _erro = '$e');
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Recuperar senha')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          TextField(controller: _email, enabled: !_pedido, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Seu e-mail')),
          if (_msg != null) Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(_msg!)),
          if (_pedido) ...[
            TextField(controller: _codigo, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Código recebido por e-mail')),
            const SizedBox(height: 12),
            TextField(controller: _nova, obscureText: true, decoration: const InputDecoration(labelText: 'Nova senha', helperText: 'Pelo menos 8 caracteres, com letras e números')),
          ],
          if (_erro != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_erro!, style: TextStyle(color: Colors.red.shade700))),
          const SizedBox(height: 16),
          BotaoCarregando(ocupado: _ocupado, texto: _pedido ? 'Criar nova senha' : 'Enviar código', aoTocar: _acao),
          if (_pedido)
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Recebi uma senha nova da equipe — voltar para entrar')),
        ]),
      );
}
