import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'idioma.dart';

const baseSite = 'https://vocacional-guanelianas.netlify.app';
const baseApi = '$baseSite/api';

class ErroApi implements Exception {
  final String mensagem;
  final int status;
  ErroApi(this.mensagem, [this.status = 0]);
  bool get semRede => status == 0;
  @override
  String toString() => tr(mensagem);
}

/// Cliente da API com sessão segura, cache para leitura offline
/// e fila de envios que é sincronizada quando a conexão volta.
class Api {
  static const _seguro = FlutterSecureStorage();
  static String? token;
  static Map<String, dynamic>? usuario;
  static VoidCallback? aoExpirar;
  static final pendentes = ValueNotifier<int>(0);
  static bool _sincronizando = false;
  static Future<void> _trava = Future.value();

  static Future<void> carregar() async {
    token = await _seguro.read(key: 'token');
    final u = await _seguro.read(key: 'usuario');
    if (u != null) usuario = jsonDecode(u);
    await _contarPendentes();
    Connectivity().onConnectivityChanged.listen((r) {
      if (!r.contains(ConnectivityResult.none)) sincronizar();
    });
  }

  static Future<void> salvarSessao(String t, Map<String, dynamic> u) async {
    token = t;
    usuario = u;
    await _seguro.write(key: 'token', value: t);
    await _seguro.write(key: 'usuario', value: jsonEncode(u));
    await _contarPendentes();
  }

  static Future<void> limparSessao() async {
    token = null;
    usuario = null;
    await _seguro.deleteAll();
    final p = await SharedPreferences.getInstance();
    final fila = p.getString('fila');
    await p.clear();
    if (fila != null) await p.setString('fila', fila);
    await p.setString('idioma', idioma.value);
    pendentes.value = 0;
    for (final d in [await getApplicationDocumentsDirectory(), await getTemporaryDirectory()]) {
      final pdfs = Directory('${d.path}/pdfs');
      if (await pdfs.exists()) await pdfs.delete(recursive: true);
    }
  }

  static Map<String, String> get _cabecalhos => {
        'content-type': 'application/json',
        'x-idioma': idioma.value,
        if (token != null) 'authorization': 'Bearer $token',
      };

  static Future<http.Response> _enviar(String metodo, String caminho, Object? corpo) async {
    try {
      final rq = http.Request(metodo, Uri.parse(baseApi + caminho))..headers.addAll(_cabecalhos);
      if (corpo != null) rq.body = jsonEncode(corpo);
      return await http.Response.fromStream(await rq.send().timeout(const Duration(seconds: 40)));
    } on Exception {
      throw ErroApi(tr('Sem conexão com a internet.'));
    }
  }

  static Future<void> _verificar(http.Response r) async {
    if (r.statusCode < 400) return;
    String msg = tr('Não foi possível concluir (erro {n}).', {'n': r.statusCode});
    try {
      final d = jsonDecode(utf8.decode(r.bodyBytes));
      if (d is Map && d['erro'] != null) msg = d['erro'];
    } catch (_) {}
    if (r.statusCode == 401 && token != null) {
      await limparSessao();
      aoExpirar?.call();
    }
    throw ErroApi(msg, r.statusCode);
  }

  /// [cache]: guarda a resposta e devolve a última cópia quando estiver sem internet.
  static Future<dynamic> req(String metodo, String caminho, {Object? corpo, bool cache = false}) async {
    http.Response r;
    try {
      r = await _enviar(metodo, caminho, corpo);
    } on ErroApi {
      if (cache) {
        final c = await lerCache(caminho);
        if (c != null) return c;
      }
      rethrow;
    }
    await _verificar(r);
    final d = r.bodyBytes.isEmpty ? null : jsonDecode(utf8.decode(r.bodyBytes));
    if (cache) {
      final p = await SharedPreferences.getInstance();
      await p.setString('cache:$caminho', jsonEncode(d));
    }
    return d;
  }

  static Future<dynamic> get(String caminho, {bool cache = true}) => req('GET', caminho, cache: cache);
  static Future<dynamic> post(String caminho, Object corpo) => req('POST', caminho, corpo: corpo);

  static Future<dynamic> lerCache(String caminho) async {
    final p = await SharedPreferences.getInstance();
    final s = p.getString('cache:$caminho');
    return s == null ? null : jsonDecode(s);
  }

  static Future<Uint8List> bytes(String caminho) async {
    final r = await _enviar('GET', caminho, null);
    await _verificar(r);
    return r.bodyBytes;
  }

  // ---------- fila offline ----------
  static Future<List<Map<String, dynamic>>> _fila() async {
    final p = await SharedPreferences.getInstance();
    return (jsonDecode(p.getString('fila') ?? '[]') as List).cast<Map<String, dynamic>>();
  }

  static bool _meu(Map x) => x['dono'] != null && x['dono'] == usuario?['id'];

  static Future<void> _contarPendentes() async => pendentes.value = (await _fila()).where(_meu).length;

  static Future<void> _gravarFila(List<Map<String, dynamic>> f) async {
    final p = await SharedPreferences.getInstance();
    await p.setString('fila', jsonEncode(f));
    pendentes.value = f.where(_meu).length;
  }

  /// Serializa leituras/escritas da fila para que envios simultâneos não se sobrescrevam.
  static Future<T> _naFila<T>(Future<T> Function() f) {
    final r = _trava.then((_) => f());
    _trava = r.then((_) {}, onError: (_) {});
    return r;
  }

  /// Envia agora; se não houver internet, guarda para enviar depois. Retorna true se já foi enviado.
  static Future<bool> enviarOuGuardar(String caminho, Map<String, dynamic> corpo) async {
    try {
      await post(caminho, corpo);
      return true;
    } on ErroApi catch (e) {
      if (!e.semRede) rethrow;
      await _naFila(() async {
        final f = await _fila();
        f.add({'id': const Uuid().v4(), 'dono': usuario?['id'], 'caminho': caminho, 'corpo': corpo, 'em': DateTime.now().toIso8601String()});
        await _gravarFila(f);
      });
      return false;
    }
  }

  static Future<bool> estaPendente(String caminho) async => (await _fila()).any((x) => _meu(x) && x['caminho'] == caminho);

  static Future<void> sincronizar() async {
    if (_sincronizando || token == null) return;
    _sincronizando = true;
    try {
      while (token != null) {
        final item = (await _fila()).where(_meu).firstOrNull;
        if (item == null) break;
        try {
          await post(item['caminho'], item['corpo']);
        } on ErroApi catch (e) {
          if (e.semRede || e.status == 401 || e.status >= 500) break;
          // erro definitivo (ex.: atividade encerrada): descarta para não travar a fila
        }
        await _naFila(() async {
          final f = await _fila();
          f.removeWhere((x) => x['id'] == item['id'] && x['em'] == item['em']);
          await _gravarFila(f);
        });
      }
    } finally {
      _sincronizando = false;
    }
  }
}
