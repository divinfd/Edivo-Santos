"""Teste dos encontros por vídeo (Daily.co).
Uso: BASE=https://vocacional-guanelianas.netlify.app ADMIN_EMAIL=... ADMIN_SENHA=... python3 tests/teste_encontros.py
Cria grupos, jovens, um responsável e encontros de teste (@exemplo.test) e apaga tudo no final."""
import json, os, uuid, datetime as dt, urllib.request, urllib.error

BASE = os.environ.get('BASE', 'https://vocacional-guanelianas.netlify.app') + '/api'
falhas = []

def req(m, cam, corpo=None, tok=None):
    h = {}
    if tok: h['authorization'] = 'Bearer ' + tok
    data = json.dumps(corpo).encode() if corpo is not None else None
    if data: h['content-type'] = 'application/json'
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + cam, data=data, method=m, headers=h), timeout=60) as x:
            return x.status, json.loads(x.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def ok(cond, nome, extra=''):
    print(('OK   ' if cond else 'FALHA') + ' ' + nome + ('' if cond else ' ' + str(extra)[:200]))
    if not cond: falhas.append(nome)

iso = lambda minutos: (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=minutos)).isoformat()
sfx = uuid.uuid4().hex[:6]
s, r = req('POST', '/auth/login', {'email': os.environ['ADMIN_EMAIL'], 'senha': os.environ['ADMIN_SENHA'], 'origem': 'painel'}); A = r['token']
s, g1 = req('POST', '/painel/grupos', {'nome': 'Teste Vídeo A ' + sfx}, A)
s, g2 = req('POST', '/painel/grupos', {'nome': 'Teste Vídeo B ' + sfx}, A)
s, resp = req('POST', '/painel/equipe', {'nome': 'Resp Vídeo', 'email': f'rv-{sfx}@exemplo.test', 'papel': 'responsavel', 'grupos': [g2['id']]}, A)
s, ja = req('POST', '/painel/jovens', {'nome': 'Jovem Vídeo A', 'email': f'va-{sfx}@exemplo.test', 'data_nascimento': '2000-05-01', 'grupos': [g1['id']], 'senha': 'SenhaTeste1'}, A)
s, jb = req('POST', '/painel/jovens', {'nome': 'Jovem Vídeo B', 'email': f'vb-{sfx}@exemplo.test', 'data_nascimento': '2001-05-01', 'grupos': [g2['id']], 'senha': 'SenhaTeste1'}, A)
TA = req('POST', '/auth/login', {'email': f'va-{sfx}@exemplo.test', 'senha': 'SenhaTeste1'})[1]['token']
TB = req('POST', '/auth/login', {'email': f'vb-{sfx}@exemplo.test', 'senha': 'SenhaTeste1'})[1]['token']

s, r = req('POST', '/painel/encontros', {'titulo': 'X', 'inicio': iso(-300), 'duracao_min': 60, 'grupos': [g1['id']]}, A)
ok(s == 400, 'horário passado recusado', r)
s, r = req('POST', '/painel/encontros', {'titulo': 'X', 'inicio': iso(60), 'duracao_min': 60, 'grupos': []}, A)
ok(s == 400, 'sem grupo recusado', r)
s, e1 = req('POST', '/painel/encontros', {'titulo': 'Encontro agora ' + sfx, 'inicio': iso(5), 'duracao_min': 30, 'grupos': [g1['id']], 'notificar': False}, A)
ok(s == 201 and e1['situacao'] == 'aberto', 'criar encontro que abre já (grupo A)', e1)
s, e2 = req('POST', '/painel/encontros', {'titulo': 'Encontro amanhã ' + sfx, 'inicio': iso(24 * 60), 'duracao_min': 60, 'grupos': [g1['id']], 'notificar': False}, A)
ok(s == 201 and e2['situacao'] == 'agendado', 'criar encontro de amanhã', e2)

s, l = req('GET', '/app/encontros', tok=TA); ok(s == 200 and {x['id'] for x in l} >= {e1['id'], e2['id']}, 'jovem A vê os encontros do grupo', l)
ok(all('sala_url' not in x and 'sala' not in x for x in l), 'lista do app não expõe o link da sala', l)
s, l = req('GET', '/app/encontros', tok=TB); ok(s == 200 and not {x['id'] for x in l} & {e1['id'], e2['id']}, 'jovem B (outro grupo) não vê', l)
s, r = req('GET', '/app/inicio', tok=TA); ok((r.get('encontro_aberto') or {}).get('id') == e1['id'], 'início mostra encontro acontecendo', r.get('encontro_aberto'))
s, r = req('POST', f"/app/encontros/{e1['id']}/entrar", {'idioma': 'es'}, TA)
ok(s == 200 and r.get('token') and 'daily.co' in r.get('url', ''), 'jovem A recebe acesso à sala aberta', r)
s, r = req('POST', f"/app/encontros/{e1['id']}/entrar", {'idioma': 'es'}, TB); ok(s == 404, 'jovem B não entra em sala de outro grupo', r)
s, r = req('POST', f"/app/encontros/{e2['id']}/entrar", {'idioma': 'pt'}, TA); ok(s == 409, 'sala de amanhã ainda fechada', r)
s, r = req('POST', f"/painel/encontros/{e1['id']}/entrar", {}, TA); ok(s == 403, 'jovem não usa a rota do painel', r)
s, r = req('POST', f"/painel/encontros/{e1['id']}/entrar", {}, A); ok(s == 200 and r.get('token'), 'admin entra como moderador', r)
s, r = req('GET', '/painel/encontros', tok=A); ok(s == 200 and r['configurado'] and any(x['id'] == e1['id'] for x in r['lista']), 'painel lista encontros', r)
ok(isinstance(r.get('uso', {}).get('usados'), int) and r['uso']['limite'] == 9000, 'painel mostra minutos usados no mês', r.get('uso'))

senha_resp = resp.get('senha_inicial')
if senha_resp:
    TR = req('POST', '/auth/login', {'email': f'rv-{sfx}@exemplo.test', 'senha': senha_resp, 'origem': 'painel'})[1].get('token')
    s, r = req('GET', '/painel/encontros', tok=TR); ok(s == 200 and not any(x['id'] == e1['id'] for x in r['lista']), 'responsável de outro grupo não vê o encontro', r)
    s, r = req('POST', f"/painel/encontros/{e1['id']}/entrar", {}, TR); ok(s == 404, 'responsável de outro grupo não entra', r)
    s, r = req('DELETE', f"/painel/encontros/{e1['id']}", tok=TR); ok(s == 404, 'responsável de outro grupo não exclui', r)
    s, et = req('POST', '/painel/encontros', {'titulo': 'Para todos ' + sfx, 'inicio': iso(5), 'duracao_min': 30, 'para_todos': True, 'grupos': [g1['id']], 'notificar': False}, A)
    s, r = req('GET', '/painel/encontros', tok=TR); ok(any(x['id'] == et['id'] and x['grupos'] == [] for x in r['lista']), 'responsável vê encontro para todos', r)
    s, r = req('POST', f"/painel/encontros/{et['id']}/entrar", {}, TR); ok(s == 200 and r.get('token'), 'responsável entra no encontro para todos', r)
    s, r = req('GET', '/app/encontros', tok=TB); ok(any(x['id'] == et['id'] for x in r), 'qualquer jovem vê encontro para todos', r)
    req('DELETE', f"/painel/encontros/{et['id']}", tok=A)
    s, r = req('POST', '/painel/encontros', {'titulo': 'R', 'inicio': iso(60), 'duracao_min': 60, 'grupos': [g1['id']]}, TR); ok(s == 400, 'responsável não cria para grupo alheio', r)
else:
    print('AVISO responsável sem senha temporária na resposta; checagens do responsável puladas', list(resp))

for e in (e1, e2):
    s, r = req('DELETE', f"/painel/encontros/{e['id']}", tok=A); ok(s == 200, 'excluir encontro ' + str(e['id']), r)
s, r = req('POST', f"/app/encontros/{e1['id']}/entrar", {}, TA); ok(s == 404, 'encontro excluído não abre', r)

for j in (ja, jb): req('DELETE', f"/painel/jovens/{j['id']}", tok=A)
req('DELETE', f"/painel/equipe/{resp.get('id') or resp.get('usuario', {}).get('id')}", tok=A)
for g in (g1, g2): req('DELETE', f"/painel/grupos/{g['id']}", tok=A)
print('\n' + ('TUDO OK' if not falhas else f'{len(falhas)} FALHA(S): {falhas}'))
