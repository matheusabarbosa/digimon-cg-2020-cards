"""
Baixa as imagens das cartas e salva em ./cartas/ com o nome do código
(ex.: EX13-035.jpg). Só baixa o que ainda não existe na pasta.

MODOS DE USO
  A) Pela planilha (o normal): na aba "Update de Fotos" copie a lista em Python
     e cole no bloco NOVAS_CARTAS logo abaixo. O script baixa SÓ essas cartas,
     converte para JPG e envia para o GitHub (git add + commit + push).
  B) Sem lista (NOVAS_CARTAS vazio): baixa as cartas que você TEM e depois as dos
     decks (inventário e decks abaixo), como antes.
  C) python baixar_imagens_digimon.py --catalogo : baixa o catálogo inteiro
     (muito mais lento e pesado; use com calma).
  Opções:  --sem-push  não envia para o GitHub (só baixa).

DE ONDE VÊM OS CÓDIGOS
  - inventario.csv (opcional): exporte a aba INVENTÁRIO da planilha como CSV
    (Arquivo > Fazer download > Valores separados por vírgula) e salve com este
    nome nesta pasta. As cartas com Tenho > 0 são baixadas primeiro.
    Sem o arquivo, o script usa o seu inventário atual (embutido abaixo).
  - decks/*.txt (opcional): listas de deck coladas do site, nos dois formatos:
        // DigimonCard.io Deck List
        1 BanchoMamemon BT8-068
        4 Chuumon (EX13-027)
    Linhas de comentário e linhas sem código são ignoradas.
  - Os decks atuais (KingEtemon, PrinceMamemon, Dynasmon) já vêm embutidos.

REQUISITOS: Python 3. Para converter para JPG:  pip install pillow
(sem o Pillow as imagens ficam em .webp).

Uso pessoal: pausa entre os pedidos para respeitar o limite do site
(15 pedidos / 10 s). Se algum download falhar, os códigos são listados no final.
"""
import csv
import glob
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

# Tudo o que o script usa fica na pasta dele (cartas/, decks/, inventario.csv).
PASTA_SCRIPT = os.path.dirname(os.path.abspath(__file__))
os.chdir(PASTA_SCRIPT)

# ---------------------------------------------------------------------------
# COLE AQUI A LISTA DA ABA "Update de Fotos" (substitua a linha abaixo inteira).
# ---------------------------------------------------------------------------
NOVAS_CARTAS = []
# ---------------------------------------------------------------------------

# Inventário atual (cartas que você tem, Tenho > 0), conforme o arquivo de contexto.
TENHO_EMBUTIDO = [
    "EX13-059", "LM-031", "EX13-025", "EX13-027", "EX13-004", "EX13-037",
    "BT23-030", "EX13-029", "EX12-053", "EX13-035", "EX13-031", "EX12-038",
    "EX13-046", "EX9-053", "EX9-018", "EX13-033", "EX13-063", "BT8-106",
    "EX13-028", "BT8-061", "EX12-041", "EX13-053", "EX13-034", "LM-029",
]

# Todas as cartas dos 3 decks atuais.
DECKS_EMBUTIDOS = [
    # KingEtemon
    "EX1-066", "EX13-027", "EX5-045", "BT13-062", "BT23-030", "BT14-038",
    "EX13-035", "EX13-031", "EX5-054", "P-246", "P-105", "BT14-097",
    "BT11-040", "EX13-028", "BT1-087", "EX5-046",
    # PrinceMamemon
    "BT8-068", "EX13-059", "P-039", "LM-031", "BT8-065", "EX12-053",
    "BT4-096", "EX13-046", "EX12-038", "EX9-053", "BT11-068", "BT6-064",
    "P-141", "EX9-018", "BT13-074", "EX13-063", "LM-061", "BT8-106",
    "BT8-061", "EX13-053", "EX12-041",
    # Dynasmon
    "LM-062", "BT18-030", "EX13-025", "EX13-004", "BT18-098", "AD1-017",
    "BT23-035", "EX13-037", "BT19-042", "BT25-030", "EX13-029", "LM-059",
    "BT18-039", "EX13-033", "BT13-106", "BT20-102", "EX13-077", "BT26-022",
    "LM-045", "EX13-034", "BT18-036", "BT19-036", "EX5-070", "LM-029",
]

URL = "https://images.digimoncard.io/images/cards/{}.webp"
PASTA = "cartas"
PASTA_DECKS = "decks"
ARQ_INVENTARIO = "inventario.csv"
PADRAO_CODIGO = re.compile(r"\b([A-Z]{1,3}\d{0,2}-\d{1,3})\b")

os.makedirs(PASTA, exist_ok=True)
os.makedirs(PASTA_DECKS, exist_ok=True)


def ler_inventario_csv(caminho):
    """Lê o CSV exportado da aba INVENTÁRIO e devolve os códigos com Tenho > 0."""
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        amostra = f.read(4096)
        f.seek(0)
        try:
            dialeto = csv.Sniffer().sniff(amostra, delimiters=",;\t")
        except csv.Error:
            dialeto = csv.excel
        linhas = list(csv.reader(f, dialeto))
    if not linhas:
        return []
    cab = [c.strip().lower() for c in linhas[0]]
    try:
        i_cod = next(i for i, c in enumerate(cab) if c in ("código", "codigo", "code"))
        i_tenho = next(i for i, c in enumerate(cab) if c == "tenho")
    except StopIteration:
        print(f"Aviso: não achei as colunas 'Código' e 'Tenho' em {caminho}; ignorando o arquivo.")
        return []
    saida = []
    for l in linhas[1:]:
        if len(l) <= max(i_cod, i_tenho):
            continue
        cod = l[i_cod].strip()
        try:
            qtd = float(l[i_tenho].replace(",", ".") or 0)
        except ValueError:
            continue
        if cod and qtd > 0:
            saida.append(cod)
    return saida


def codigos_do_catalogo():
    """Lista todos os códigos do catálogo pela API pública (um pedido só)."""
    url = ("https://digimoncard.io/api-public/getAllCards.php"
           "?sort=name&series=Digimon%20Card%20Game&sortdirection=asc")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        dados = json.loads(r.read().decode("utf-8"))
    cods = []
    for item in dados:
        c = (item.get("cardnumber") or item.get("id") or "").strip().upper()
        if c:
            cods.append(c)
    return list(dict.fromkeys(cods))


MODO_CATALOGO = "--catalogo" in sys.argv
FAZER_PUSH = "--sem-push" not in sys.argv

if MODO_CATALOGO:
    codigos = codigos_do_catalogo()
    tenho = []
    print(f"Catálogo: {len(codigos)} cartas.\n")
elif NOVAS_CARTAS:
    codigos = list(dict.fromkeys(c.strip().upper() for c in NOVAS_CARTAS if c.strip()))
    tenho = []
    print(f"Lista da planilha: {len(codigos)} cartas.\n")
else:
    codigos = None

# 1) cartas que você tem
if codigos is not None:
    pass
elif os.path.exists(ARQ_INVENTARIO):
    tenho = ler_inventario_csv(ARQ_INVENTARIO)
    print(f"Inventário lido de {ARQ_INVENTARIO}: {len(tenho)} cartas com Tenho > 0.")
else:
    tenho = list(TENHO_EMBUTIDO)
    print(f"{ARQ_INVENTARIO} não encontrado: usando o inventário embutido ({len(tenho)} cartas).")

# 2) o resto: decks embutidos + listas novas em ./decks/*.txt
if codigos is None:
    resto = list(DECKS_EMBUTIDOS)
    for arq in sorted(glob.glob(os.path.join(PASTA_DECKS, "*.txt"))):
        with open(arq, encoding="utf-8") as f:
            for linha in f:
                if linha.strip().startswith("//"):
                    continue
                m = PADRAO_CODIGO.search(linha)
                if m:
                    resto.append(m.group(1))

    codigos = list(dict.fromkeys(tenho + resto))  # únicos; as que você tem vêm primeiro
    print(f"Total: {len(codigos)} cartas ({len(set(tenho))} que você tem + {len(codigos) - len(set(tenho))} das listas).\n")

try:
    from PIL import Image
    TEM_PIL = True
except ImportError:
    TEM_PIL = False
    print("Pillow não instalado: as imagens ficarão em .webp.\n")

falhas = []
baixadas = 0
for i, codigo in enumerate(codigos, 1):
    destino_webp = os.path.join(PASTA, f"{codigo}.webp")
    destino_jpg = os.path.join(PASTA, f"{codigo}.jpg")
    if os.path.exists(destino_jpg) or (not TEM_PIL and os.path.exists(destino_webp)):
        print(f"[{i}/{len(codigos)}] {codigo}: já existe")
        continue
    try:
        req = urllib.request.Request(URL.format(codigo), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r, open(destino_webp, "wb") as f:
            f.write(r.read())
        if TEM_PIL:
            Image.open(destino_webp).convert("RGB").save(destino_jpg, "JPEG", quality=85)
            os.remove(destino_webp)
        baixadas += 1
        print(f"[{i}/{len(codigos)}] {codigo}: ok")
    except Exception as e:
        print(f"[{i}/{len(codigos)}] {codigo}: FALHOU ({e})")
        falhas.append(codigo)
    time.sleep(1.5)

print(f"\nConcluído: {baixadas} imagem(ns) nova(s).")
if falhas:
    print("Baixar manualmente (abra a carta no site e salve a imagem):", ", ".join(falhas))


def git(*args):
    return subprocess.run(["git", *args], cwd=PASTA_SCRIPT, capture_output=True, text=True)


if FAZER_PUSH:
    print("\nEnviando para o GitHub...")
    git("add", PASTA)
    if git("diff", "--cached", "--quiet", "--", PASTA).returncode == 0:
        print("Nada novo para enviar.")
    else:
        n_novas = len(git("diff", "--cached", "--name-only", "--", PASTA).stdout.split())
        r = git("commit", "-m", f"Adiciona {n_novas} imagem(ns) de cartas")
        print(r.stdout.strip() or r.stderr.strip())
        r = git("push")
        print(r.stdout.strip() or r.stderr.strip())
        print("Enviado." if r.returncode == 0 else "O push falhou: rode 'git push' à mão e veja a mensagem acima.")
    print("Agora, na planilha: menu Digimon > Verificar fotos no repositório.")