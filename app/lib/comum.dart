import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'api.dart';

const azul = Color(0xFF1F4E8C);
const azulEscuro = Color(0xFF163A69);
const dourado = Color(0xFFC9A227);
const fundo = Color(0xFFF6F4EE);

final navKey = GlobalKey<NavigatorState>();

ThemeData tema() {
  final cs = ColorScheme.fromSeed(seedColor: azul, primary: azul, secondary: dourado, surface: Colors.white);
  return ThemeData(
    colorScheme: cs,
    scaffoldBackgroundColor: fundo,
    appBarTheme: const AppBarTheme(backgroundColor: azul, foregroundColor: Colors.white, centerTitle: false),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Color(0xFFE4E0D5))),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(0, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
    ),
  );
}

DateTime? _data(dynamic s) => s == null ? null : DateTime.tryParse(s.toString())?.toLocal();
String fmtData(dynamic s) {
  final d = _data(s);
  return d == null ? '' : DateFormat('dd/MM/yyyy', 'pt_BR').format(d);
}

String fmtDataHora(dynamic s) {
  final d = _data(s);
  return d == null ? '' : DateFormat("dd/MM/yyyy 'às' HH:mm", 'pt_BR').format(d);
}

String fmtDataLonga(DateTime d) => DateFormat("EEEE, d 'de' MMMM 'de' y", 'pt_BR').format(d);

void aviso(BuildContext context, String msg, {bool erro = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: erro ? Colors.red.shade700 : azulEscuro));
}

String imagemUrl(String key) => '$baseApi/imagens/$key';

/// Carrega dados da API mostrando carregamento, erro e "puxar para atualizar".
class Carregador<T> extends StatefulWidget {
  final Future<T> Function() carregar;
  final Widget Function(BuildContext, T, Future<void> Function() recarregar) construir;
  const Carregador({super.key, required this.carregar, required this.construir});
  @override
  State<Carregador<T>> createState() => CarregadorEstado<T>();
}

class CarregadorEstado<T> extends State<Carregador<T>> {
  T? dados;
  Object? erro;
  bool carregando = true;

  @override
  void initState() {
    super.initState();
    recarregar();
  }

  Future<void> recarregar() async {
    setState(() => carregando = dados == null);
    try {
      final d = await widget.carregar();
      if (mounted) {
        setState(() {
          dados = d;
          erro = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => erro = e);
    } finally {
      if (mounted) setState(() => carregando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (carregando && dados == null) return const Center(child: CircularProgressIndicator());
    if (dados == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.cloud_off, size: 48, color: Colors.grey.shade500),
            const SizedBox(height: 12),
            Text('$erro', textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: recarregar, child: const Text('Tentar novamente')),
          ]),
        ),
      );
    }
    return RefreshIndicator(onRefresh: recarregar, child: widget.construir(context, dados as T, recarregar));
  }
}

class Vazio extends StatelessWidget {
  final IconData icone;
  final String texto;
  const Vazio(this.icone, this.texto, {super.key});
  @override
  Widget build(BuildContext context) => ListView(children: [
        const SizedBox(height: 80),
        Icon(icone, size: 56, color: azul.withValues(alpha: 0.35)),
        const SizedBox(height: 12),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 32), child: Text(texto, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54))),
      ]);
}

class Titulo extends StatelessWidget {
  final String texto;
  const Titulo(this.texto, {super.key});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 6),
        child: Text(texto, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: azulEscuro)),
      );
}

class BotaoCarregando extends StatelessWidget {
  final bool ocupado;
  final String texto;
  final VoidCallback? aoTocar;
  const BotaoCarregando({super.key, required this.ocupado, required this.texto, this.aoTocar});
  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: ocupado ? null : aoTocar,
        child: ocupado ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : Text(texto),
      );
}
