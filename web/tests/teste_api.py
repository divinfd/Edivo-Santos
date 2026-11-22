"""Teste ponta a ponta da API (produção ou local).
Uso: BASE=https://vocacional-guanelianas.netlify.app ADMIN_EMAIL=... ADMIN_SENHA=... python3 tests/teste_api.py arquivo.pdf
Cria dados de teste (e-mails @exemplo.test) e apaga tudo no final."""
import json, os, sys, time, uuid, urllib.request, urllib.error

BASE = os.environ.get('BASE', 'https://vocacional-guanelianas.netlify.app') + '/api'
falhas = []

def req(m, cam, corpo=None, tok=None, bruto=None, tipo=None):
    h = {}
    if tok: h['authorization'] = 'Bearer ' + tok
    data = None
    if bruto is not None: data, h['content-type'] = bruto, tipo or 'application/octet-stream'
    elif corpo is not None: data, h['content-type'] = json.dumps(corpo).encode(), 'application/json'
    r = urllib.request.Request(BASE + cam, data=data, method=m, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x:
            b = x.read(); ct = x.headers.get('content-type', '')
            return x.status, (json.loads(b) if 'json' in ct else b)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b)
        except Exception: return e.code, b

def ok(cond, nome, extra=''):
    print(('OK   ' if cond else 'FALHA') + ' ' + nome + (' ' + str(extra)[:200] if not cond else ''))
    if not cond: falhas.append(nome)

sfx = uuid.uuid4().hex[:6]
s, r = req('POST', '/auth/login', {'email': os.environ['ADMIN_EMAIL'], 'senha': os.environ['ADMIN_SENHA'], 'origem': 'painel'})
ok(s == 200, 'login admin', r); A = r['token']
s, r = req('POST', '/auth/login', {'email': os.environ['ADMIN_EMAIL'], 'senha': 'errada123'})
ok(s == 401, 'senha errada recusada', s)

s, g1 = req('POST', '/painel/grupos', {'nome': 'Teste Grupo A ' + sfx}, A); ok(s == 201, 'criar grupo A', g1)
s, g2 = req('POST', '/painel/grupos', {'nome': 'Teste Grupo B ' + sfx}, A); ok(s == 201, 'criar grupo B', g2)
s, resp = req('POST', '/painel/equipe', {'nome': 'Responsável Teste', 'email': f'resp-{sfx}@exemplo.test', 'papel': 'responsavel', 'grupos': [g1['id']]}, A)
ok(s == 201, 'cadastrar responsável', resp)
s, ja = req('POST', '/painel/jovens', {'nome': 'Jovem Teste A', 'email': f'ja-{sfx}@exemplo.test', 'data_nascimento': '2000-05-01', 'grupos': [g1['id']], 'senha': 'SenhaTeste1'}, A)
ok(s == 201, 'cadastrar jovem A pelo painel', ja)
s, jb = req('POST', '/painel/jovens', {'nome': 'Jovem Teste B', 'email': f'jb-{sfx}@exemplo.test', 'data_nascimento': '2001-05-01', 'grupos': [g2['id']], 'senha': 'SenhaTeste1'}, A)
ok(s == 201, 'cadastrar jovem B pelo painel', jb)

# cadastro pelo app: menor sem autorização é recusado; com autorização fica pendente
s, r = req('POST', '/auth/cadastro', {'nome': 'Menor Teste', 'email': f'menor-{sfx}@exemplo.test', 'senha': 'SenhaTeste1', 'data_nascimento': '2012-01-01', 'aceite_privacidade': True})
ok(s == 400, 'menor sem responsável legal recusado', r)
s, r = req('POST', '/auth/cadastro', {'nome': 'Menor Teste', 'email': f'menor-{sfx}@exemplo.test', 'senha': 'SenhaTeste1', 'data_nascimento': '2012-01-01', 'aceite_privacidade': True,
    'responsavel_legal_nome': 'Mãe Teste', 'responsavel_legal_contato': '11999990000', 'consentimento_responsavel': True})
ok(s == 201, 'cadastro de menor com autorização', r)
s, r = req('POST', '/auth/login', {'email': f'menor-{sfx}@exemplo.test', 'senha': 'SenhaTeste1'})
ok(s == 403, 'cadastro pendente não entra antes da aprovação', r)

s, r = req('POST', '/auth/login', {'email': f'ja-{sfx}@exemplo.test', 'senha': 'SenhaTeste1'}); ok(s == 200, 'login jovem A', r); TA = r['token']
s, r = req('POST', '/auth/login', {'email': f'jb-{sfx}@exemplo.test', 'senha': 'SenhaTeste1'}); ok(s == 200, 'login jovem B', r); TB = r['token']
s, r = req('GET', '/painel/dashboard', tok=TA); ok(s == 403, 'jovem não acessa o painel', s)

# PDF em partes
pdf = open(sys.argv[1], 'rb').read()
s, f = req('POST', '/painel/arquivos', {'nome': 'teste.pdf', 'tamanho': len(pdf)}, A); ok(s == 201, 'iniciar upload PDF', f)
tp = f['tamanho_parte']
for i in range(f['partes']):
    s, r = req('PUT', f"/painel/arquivos/{f['id']}/partes/{i}", tok=A, bruto=pdf[i * tp:(i + 1) * tp]); ok(s == 200, f'enviar parte {i}', r)
s, r = req('POST', f"/painel/arquivos/{f['id']}/concluir", {}, A); ok(s == 200, 'concluir upload', r)
s, r = req('POST', '/painel/arquivos', {'nome': 'falso.pdf', 'tamanho': 10}, A)
s2, r2 = req('PUT', f"/painel/arquivos/{r['id']}/partes/0", tok=A, bruto=b'nao e pdf!')
ok(s2 == 400, 'arquivo que não é PDF recusado', r2)

ativ = {'titulo': 'Oração de teste ' + sfx, 'descricao': 'Reze com calma.', 'categoria': 'Meditações', 'arquivo_id': f['id'], 'para_todos': False, 'grupos': [g1['id']],
        'permitir_offline': True, 'perguntas': [
            {'texto': 'O que tocou seu coração?', 'tipo': 'texto_longo', 'obrigatoria': True},
            {'texto': 'Uma palavra', 'tipo': 'texto_curto', 'obrigatoria': False},
            {'texto': 'Como você se sentiu?', 'tipo': 'multipla', 'opcoes': ['Em paz', 'Inquieto'], 'obrigatoria': True},
            {'texto': 'Quanto ajudou?', 'tipo': 'escala', 'opcoes': [1, 5], 'obrigatoria': True}]}
s, at = req('POST', '/painel/atividades', ativ, A); ok(s == 201 and len(at['perguntas']) == 4, 'criar atividade com 4 perguntas', at)
s, r = req('GET', '/app/atividades', tok=TA); ok(s == 200 and not any(x['id'] == at['id'] for x in r), 'rascunho invisível ao jovem')
s, r = req('POST', f"/painel/atividades/{at['id']}/publicar", {'notificar': True}, A); ok(s == 200, 'publicar atividade', r)
s, r = req('GET', '/app/atividades', tok=TA); ok(s == 200 and any(x['id'] == at['id'] for x in r), 'jovem A (grupo A) vê a atividade')
s, r = req('GET', '/app/atividades', tok=TB); ok(s == 200 and not any(x['id'] == at['id'] for x in r), 'jovem B (grupo B) NÃO vê a atividade')
s, r = req('GET', f"/app/atividades/{at['id']}", tok=TB); ok(s in (403, 404), 'jovem B bloqueado ao abrir atividade', s)
s, r = req('GET', f"/app/arquivos/{f['id']}/partes/0", tok=TB); ok(s in (403, 404), 'jovem B bloqueado ao baixar PDF', s)
s, det = req('GET', f"/app/atividades/{at['id']}", tok=TA); ok(s == 200 and len(det['perguntas']) == 4, 'jovem A abre atividade', det)
baixado = b''.join(req('GET', f"/app/arquivos/{f['id']}/partes/{i}", tok=TA)[1] for i in range(det['arquivo_partes']))
ok(baixado == pdf, 'PDF baixado pelo jovem é idêntico ao enviado')
s, r = req('POST', f"/app/atividades/{at['id']}/progresso", {'status': 'iniciada'}, TA); ok(s == 200, 'iniciar oração')
P = {p['texto']: p['id'] for p in det['perguntas']}
s, r = req('POST', f"/app/atividades/{at['id']}/resposta", {'itens': [{'pergunta_id': P['O que tocou seu coração?'], 'valor': ''}]}, TA)
ok(s == 400, 'pergunta obrigatória sem resposta recusada', r)
s, r = req('POST', f"/app/atividades/{at['id']}/resposta", {'itens': [{'pergunta_id': P['O que tocou seu coração?'], 'valor': 'x'}, {'pergunta_id': P['Como você se sentiu?'], 'valor': 'Outra'}, {'pergunta_id': P['Quanto ajudou?'], 'valor': '3'}]}, TA)
ok(s == 400, 'opção inválida recusada', r)
cu = str(uuid.uuid4())
corpo = {'client_uuid': cu, 'comentario': 'Obrigado!', 'itens': [{'pergunta_id': P['O que tocou seu coração?'], 'valor': 'A escuta de Deus.'}, {'pergunta_id': P['Como você se sentiu?'], 'valor': 'Em paz'}, {'pergunta_id': P['Quanto ajudou?'], 'valor': '5'}]}
s, rr = req('POST', f"/app/atividades/{at['id']}/resposta", corpo, TA); ok(s == 201, 'enviar feedback', rr)
s, r = req('POST', f"/app/atividades/{at['id']}/resposta", corpo, TA); ok(s == 200 and r.get('repetida') and r['id'] == rr['id'], 'reenvio offline (mesmo client_uuid) não duplica', r)
s, r = req('GET', '/app/respostas', tok=TA); ok(s == 200 and len(r) == 1 and len(r[0]['itens']) == 3, 'histórico do jovem A', r)
s, r = req('GET', '/app/respostas', tok=TB); ok(s == 200 and len(r) == 0, 'jovem B não vê respostas de A', r)
s, r = req('GET', f"/painel/respostas/{rr['id']}", tok=TB); ok(s == 403, 'jovem B bloqueado na API do painel', s)
s, r = req('GET', '/painel/respostas', tok=A); ok(s == 200 and any(x['id'] == rr['id'] for x in r), 'resposta aparece no painel (admin)')
s, r = req('GET', f"/painel/respostas/{rr['id']}", tok=A); ok(s == 200 and r['lida_em'] is None, 'admin abre resposta individual', r)
s, r = req('POST', f"/painel/jovens/{ja['id']}/observacoes", {'texto': 'Acompanhar com carinho.', 'resposta_id': rr['id']}, A); ok(s == 201, 'observação privada')
s, r = req('GET', f"/painel/jovens/{ja['id']}", tok=A); ok(s == 200 and r['atividades'][0]['resposta_id'] == rr['id'], 'histórico individual no painel', r)

# responsável vê só grupo A
s, r = req('POST', f"/painel/equipe/{resp['id']}/senha", {}, A); senha_resp = r['senha_temporaria']
s, r = req('POST', '/auth/login', {'email': f'resp-{sfx}@exemplo.test', 'senha': senha_resp, 'origem': 'painel'}); ok(s == 200, 'login responsável', r); R = r['token']
s, r = req('GET', '/painel/jovens', tok=R); ids = [x['id'] for x in r]
ok(ja['id'] in ids and jb['id'] not in ids, 'responsável vê só jovens do seu grupo', ids)
s, r = req('GET', f"/painel/jovens/{jb['id']}", tok=R); ok(s in (403, 404), 'responsável bloqueado no jovem de outro grupo', s)
s, r = req('GET', f"/painel/respostas/{rr['id']}", tok=R); ok(s == 200, 'responsável vê resposta do seu grupo')
s, r = req('GET', '/painel/equipe', tok=R); ok(s == 403, 'responsável não gerencia equipe', s)
s, r = req('PUT', '/painel/config', {'nome_app': 'X'}, R); ok(s == 403, 'responsável não altera configurações', s)

# mensagens, avisos, liturgia, família, recuperação
s, m = req('POST', '/app/mensagens', {'tipo': 'orientacao', 'texto': 'Gostaria de conversar.'}, TA); ok(s == 201, 'jovem envia mensagem')
uid_msg = f'msg-{sfx}'
s, m1 = req('POST', '/app/mensagens', {'tipo': 'duvida', 'texto': 'Enviada sem internet', 'client_uuid': uid_msg}, TA)
s2, m2 = req('POST', '/app/mensagens', {'tipo': 'duvida', 'texto': 'Enviada sem internet', 'client_uuid': uid_msg}, TA)
ok(s == 201 and s2 == 200 and m1['id'] == m2['id'], 'mensagem reenviada da fila offline não duplica', (s, s2))
s, r = req('POST', f"/painel/mensagens/{m['id']}/responder", {'resposta': 'Claro! Vamos marcar.'}, R); ok(s == 200, 'responsável responde mensagem', r)
s, r = req('GET', '/app/mensagens', tok=TA); ok(s == 200 and any(x['id'] == m['id'] and x['resposta'] for x in r), 'jovem vê a resposta')
s, r = req('GET', '/app/avisos', tok=TA); ok(s == 200 and any(x.get('atividade_id') == at['id'] for x in r), 'aviso de nova oração registrado', r[:2] if isinstance(r, list) else r)
s, r = req('GET', '/app/liturgia?data=2026-12-25', tok=TA); ok(s == 200 and r.get('evangelho'), 'liturgia 25/12/2026', r)
s, r = req('GET', '/app/familia', tok=TA); ok(s == 200 and len(r) == 4 and all(x['itens'] for x in r), 'Família Guanelliana com 4 seções')
s, r = req('GET', '/app/inicio', tok=TA); ok(s == 200 and r['nome_app'] == 'Vocacional Hermanas Guanelianas', 'tela inicial', r)
s, r = req('POST', '/auth/esqueci', {'email': f'jb-{sfx}@exemplo.test'}); ok(s == 200, 'pedido de recuperação de senha', r)
s, r = req('GET', '/painel/recuperacoes', tok=A); ok(s == 200 and any(x['usuario_id'] == jb['id'] for x in r), 'pedido aparece no painel')
s, r = req('POST', f"/painel/jovens/{jb['id']}/senha", {}, A); nova = r['senha_temporaria']
s, r = req('GET', '/app/inicio', tok=TB); ok(s == 401, 'sessão antiga encerrada após nova senha', s)
s, r = req('POST', '/auth/login', {'email': f'jb-{sfx}@exemplo.test', 'senha': nova}); ok(s == 200, 'login com senha temporária'); TB = r['token']
s, r = req('POST', '/auth/sair', {}, TB); s, r = req('GET', '/app/inicio', tok=TB); ok(s == 401, 'logout invalida a sessão', s)
s, r = req('GET', '/painel/dashboard', tok=A); ok(s == 200 and r['indicadores']['respostas'] >= 1, 'dashboard', r.get('indicadores'))

# limpeza
for j in (ja, jb): req('DELETE', f"/painel/jovens/{j['id']}", tok=A)
s, lista = req('GET', '/painel/jovens?busca=menor-' + sfx, tok=A)
for j in lista: req('DELETE', f"/painel/jovens/{j['id']}", tok=A)
s, r = req('DELETE', f"/painel/atividades/{at['id']}", tok=A); ok(s == 200, 'limpeza atividade', r)
for g in (g1, g2): req('DELETE', f"/painel/grupos/{g['id']}", tok=A)
req('PUT', f"/painel/equipe/{resp['id']}", {'nome': 'Responsável Teste (removido)', 'email': f'resp-{sfx}@exemplo.test', 'papel': 'responsavel', 'status': 'inativo'}, A)
print('\n%d falha(s)' % len(falhas) if falhas else '\nTODOS OS TESTES PASSARAM')
sys.exit(1 if falhas else 0)
