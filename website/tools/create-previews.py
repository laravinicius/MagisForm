"""Mockups de divulgação baseados nos módulos atuais, sem IPC ou banco de dados."""
from pathlib import Path
import html

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/images/sources'
OUT.mkdir(parents=True, exist_ok=True)
GREEN, INK, MUTED, SAGE, CORAL = '#173E35', '#17201D', '#5F6965', '#DCE8E1', '#D95C4F'
parts = []

def rect(x, y, w, h, fill, radius=0, border=None):
    stroke = f' stroke="{border}"' if border else ''
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}"{stroke}/>')

def text(x, y, value, size=14, color=INK, weight=400):
    parts.append(f'<text x="{x}" y="{y}" font-family="Segoe UI, Arial, sans-serif" font-size="{size}" font-weight="{weight}" fill="{color}">{html.escape(str(value))}</text>')

def line(x1,y1,x2,y2,color='#E1E5E1'):
    parts.append(f'<path d="M{x1} {y1}H{x2}" stroke="{color}"/>' if y1==y2 else f'<path d="M{x1} {y1}L{x2} {y2}" stroke="{color}"/>')

def pill(x,y,label,bg=SAGE,fg=GREEN,width=104):
    rect(x,y,width,27,bg,7)
    text(x+10,y+18,label,11,fg,600)

def shell(active, title, subtitle):
    global parts
    parts=[]
    rect(0,0,1280,768,'#F6F7F5')
    rect(0,0,1280,32,GREEN)
    text(18,21,'MagisForm — Manipulação',12,'#FFFFFF',600)
    text(1164,21,'—    □    ×',13,'#FFFFFF')
    rect(0,32,212,736,GREEN)
    art=(ROOT/'assets/brand/symbol-white.svg').read_text(encoding='utf-8')
    art=art[art.index('<g'):art.rindex('</svg>')]
    parts.append(f'<g transform="translate(19 53) scale(.15)">{art}</g>')
    text(64,78,'MagisForm',17,'#FFFFFF',650)
    text(25,118,'GESTÃO DE FÓRMULAS',10,'#DCE8E1',600)
    menu=['Painel inicial','Nova fórmula','Pendentes','Confirmadas','Histórico','Clientes','Insumos','Fórmulas salvas','Usuários','Auditoria']
    for i,label in enumerate(menu):
        y=145+i*44
        if label==active:
            rect(12,y,188,36,'#31594E',8)
        rect(25,y+11,13,13,'#DCE8E1' if label==active else '#7B9A8E',3)
        text(51,y+25,label,13,'#FFFFFF' if label==active else '#DCE8E1',600 if label==active else 400)
    line(20,663,192,663,'#52766A')
    rect(24,683,33,33,'#DCE8E1',17)
    text(35,706,'D',13,GREEN,700)
    text(67,696,'Equipe de demonstração',10,'#FFFFFF',600)
    text(67,713,'Gerente',10,'#DCE8E1')
    rect(212,32,1068,62,'#FFFFFF')
    text(239,71,'Farmácia de demonstração',14,GREEN,600)
    text(1066,70,'Ambiente ilustrativo',12,MUTED)
    text(242,140,title,27,INK,650)
    text(242,165,subtitle,13,MUTED)

def finish(name):
    text(242,748,'PRÉVIA ILUSTRATIVA COM DADOS FICTÍCIOS',10,MUTED,600)
    raw=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="768" viewBox="0 0 1280 768" role="img"><title>MagisForm — {html.escape(name)} — dados fictícios</title>{"".join(parts)}</svg>\n'
    (OUT/f'{name}.svg').write_text(raw,encoding='utf-8')

shell('Confirmadas','Fórmulas em produção','Fórmulas confirmadas para manipulação')
rect(242,186,140,39,SAGE,8)
text(258,211,'Em produção',13,GREEN,600)
text(405,211,'Aguardando retirada',13,MUTED)
line(242,233,1242,233)
rect(242,253,760,43,'#FFFFFF',9,'#D8DED8')
text(263,280,'Buscar cliente, orçamento ou atendente...',13,MUTED)
rect(1020,253,222,43,'#FFFFFF',9,'#D8DED8')
text(1037,280,'Todos os pagamentos  ▾',12,MUTED)
rect(242,321,1000,343,'#FFFFFF',12,'#D8DED8')
rect(243,322,998,45,'#EFF2EF',12)
headers=[(263,'CLIENTE'),(446,'ORÇAMENTO'),(561,'QUANTIDADE'),(690,'VALOR'),(789,'RESTANTE'),(902,'ENTREGA'),(1030,'PAGAMENTO')]
for x,t in headers:text(x,350,t,10,MUTED,650)
rows=[('Cliente exemplo 01','MF-001','60 cápsulas','R$ 180,00','R$ 108,00','05/10/2026','Parcial'),('Cliente exemplo 02','MF-002','30 cápsulas','R$ 95,00','—','05/10/2026','Pago'),('Cliente exemplo 03','MF-003','100 ml','R$ 120,00','—','06/10/2026','Pendente'),('Cliente exemplo 04','MF-004','60 cápsulas','R$ 160,00','R$ 80,00','06/10/2026','Parcial'),('Cliente exemplo 05','MF-005','30 g','R$ 75,00','—','07/10/2026','Pago')]
for i,row in enumerate(rows):
    y=385+i*54
    if i%2==0:rect(243,y-18,998,54,'#FBFCFA')
    for (x,_),value in zip(headers,row):
        if x!=1030:text(x,y+8,value,12,INK,600 if x==263 else 400)
    payment=row[-1]
    bg,fg=('#F9E7CA','#775016') if payment=='Parcial' else (SAGE,GREEN) if payment=='Pago' else ('#F4E6E3','#873E32')
    pill(1030,y-10,payment,bg,fg,90)
    text(1203,y+8,'›',23,MUTED)
text(263,643,'5 fórmulas em produção · dados de demonstração',11,MUTED)
finish('formulas')

shell('Painel inicial','Bem-vindo, equipe.','Aqui está o que está acontecendo na farmácia hoje.')
stats=[('Fórmulas totais','48'),('Pendentes','12'),('Confirmadas','26'),('Clientes','35'),('Insumos','18')]
for i,(label,value) in enumerate(stats):
    x=242+i*203
    rect(x,196,185,128,'#FFFFFF',14,'#D8DED8')
    rect(x+16,212,30,30,SAGE,8)
    text(x+25,233,'+',18,GREEN)
    text(x+16,267,label,12,MUTED)
    text(x+16,304,value,29,INK,650)
rect(242,360,672,238,'#FFFFFF',14,'#D8DED8')
text(265,393,'Ações rápidas',18,INK,650)
actions=[('Nova fórmula',CORAL,INK),('Pendentes',GREEN,'#FFFFFF'),('Confirmadas',GREEN,'#FFFFFF')]
for i,(label,bg,fg) in enumerate(actions):
    x=265+i*210
    rect(x,415,190,144,bg,12)
    text(x+82,467,'+' if i==0 else '○' if i==1 else '✓',29,fg)
    text(x+28,523,label,15,fg,600)
text(242,642,'Dados centralizados para acompanhar o dia a dia da operação.',13,MUTED)
finish('dashboard')

shell('Nova fórmula','Nova fórmula','Preencha as informações para registrar o pedido.')
rect(242,190,1000,117,'#FFFFFF',12,'#D8DED8')
text(263,219,'1. Cliente',16,INK,650)
text(263,246,'CLIENTE',10,MUTED,600)
rect(263,255,456,34,'#FAFBF9',6,'#D8DED8')
text(275,277,'Cliente exemplo 01',12)
text(744,246,'RESPONSÁVEL',10,MUTED,600)
rect(744,255,476,34,'#FAFBF9',6,'#D8DED8')
text(756,277,'Responsável de demonstração',12)
rect(242,324,1000,165,'#FFFFFF',12,'#D8DED8')
text(263,354,'2. Matérias-primas',16,INK,650)
text(263,381,'INSUMO',10,MUTED,600)
text(820,381,'QUANTIDADE',10,MUTED,600)
text(980,381,'UNIDADE',10,MUTED,600)
rect(263,390,535,35,'#FAFBF9',6,'#D8DED8')
text(275,413,'Insumo de exemplo A',12)
rect(820,390,132,35,'#FAFBF9',6,'#D8DED8')
text(833,413,'300',12)
rect(980,390,112,35,'#FAFBF9',6,'#D8DED8')
text(993,413,'mg',12)
rect(1110,390,110,35,GREEN,6)
text(1123,413,'Adicionar',12,'#FFFFFF',600)
text(263,462,'Insumo de exemplo A',12)
text(820,462,'300 mg',12)
rect(242,507,1000,132,'#FFFFFF',12,'#D8DED8')
text(263,537,'3. Orçamento',16,INK,650)
for x,label,value,w in [(263,'NÚMERO','MF-001',185),(474,'QUANTIDADE','60 cápsulas',214),(714,'VALOR','R$ 180,00',200),(940,'PAGAMENTO','Parcial',280)]:
    text(x,565,label,10,MUTED,600)
    rect(x,575,w,35,'#FAFBF9',6,'#D8DED8')
    text(x+12,598,value,12)
text(263,670,'Previsão de entrega: 05/10/2026',12,MUTED)
text(659,670,'Quantia paga: R$ 72,00',12,MUTED)
rect(966,654,276,42,CORAL,9)
text(998,681,'Salvar fórmula pendente',14,INK,600)
finish('recipe')
print('Três mockups vetoriais criados com dados sintéticos.')
