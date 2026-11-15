import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api.dart';
import 'idioma.dart';
import 'comum.dart';

final _local = FlutterLocalNotificationsPlugin();
final _canal = AndroidNotificationChannel('avisos', tr('Avisos e orações'),
    description: tr('Novas orações, lembretes e respostas da equipe vocacional'), importance: Importance.high);

/// Tipo da última notificação tocada ('atividade', 'mensagem', 'recebida', 'aviso').
final aberturaPush = ValueNotifier<String?>(null);
bool _pronto = false;
String? tokenDispositivo;

@pragma('vm:entry-point')
Future<void> _segundoPlano(RemoteMessage m) async {
  await Firebase.initializeApp();
}

Future<void> iniciarPush() async {
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_segundoPlano);
    await _local.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('ic_notificacao')),
      onDidReceiveNotificationResponse: (r) => aberturaPush.value = r.payload ?? 'aviso',
    );
    await _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.createNotificationChannel(_canal);
    FirebaseMessaging.onMessage.listen((m) {
      final n = m.notification;
      if (n == null) return;
      _local.show(
        id: m.hashCode,
        title: n.title,
        body: n.body,
        payload: m.data['tipo'],
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(_canal.id, _canal.name,
              channelDescription: _canal.description, importance: Importance.high, priority: Priority.high, color: azul, icon: 'ic_notificacao'),
        ),
      );
    });
    FirebaseMessaging.onMessageOpenedApp.listen((m) => aberturaPush.value = m.data['tipo'] ?? 'aviso');
    final inicial = await FirebaseMessaging.instance.getInitialMessage();
    if (inicial != null) aberturaPush.value = inicial.data['tipo'] ?? 'aviso';
    // O servidor envia por token FCM (API HTTP v1); onRegistered entrega FID, que exige outro formato de envio.
    // ignore: deprecated_member_use
    FirebaseMessaging.instance.onTokenRefresh.listen(_registrar);
    _pronto = true;
  } catch (e) {
    debugPrint('Notificações indisponíveis: $e');
  }
}

Future<void> registrarDispositivo() async {
  if (!_pronto || Api.token == null) return;
  try {
    await FirebaseMessaging.instance.requestPermission();
    // ignore: deprecated_member_use
    final t = await FirebaseMessaging.instance.getToken();
    if (t != null) await _registrar(t);
  } catch (e) {
    debugPrint('Falha ao registrar notificações: $e');
  }
}

Future<void> _registrar(String t) async {
  tokenDispositivo = t;
  if (Api.token == null) return;
  try {
    await Api.post('/app/dispositivo', {'token': t, 'plataforma': 'android', 'idioma': idioma.value});
  } catch (_) {}
}
