# digimon-cg-2020-cards

Imagens das cartas do **Digimon Card Game (TCG)** usadas na minha planilha de controle de decks e compras (Google Sheets), mais um script em Python que baixa só as imagens que ainda faltam.

> Projeto pessoal, sem fins comerciais. As imagens das cartas pertencem aos seus respectivos detentores (Bandai / Digimon). Veja [Avisos](#avisos).

## Para que serve

Na planilha, a aba de faltas mostra a **foto de cada carta que falta**, o que ajuda a achar a carta certa quando se procura num bulk (caixa de cartas soltas). As fotos vêm deste repositório, pela função `IMAGE` do Google Sheets.

## Estrutura

```
digimon-cg-2020-cards/
├── README.md
└── digimon/
    ├── cartas/                      imagens, uma por carta: CÓDIGO.jpg (ex.: EX13-035.jpg)
    ├── decks/                       listas de deck em .txt (opcional, veja abaixo)
    └── baixar_imagens_digimon.py    script que baixa as imagens que faltam
```

Tudo o que o script usa fica dentro da pasta `digimon/`: rode os comandos a partir dela.

O nome de cada imagem é o **código oficial da carta** (`EX13-035`, `BT18-030`, `P-246`, `LM-029`). É esse código que a planilha usa para achar a foto.

## Como usar o script

Requisitos: Python 3 e, para converter para JPG, o Pillow.

```bash
git clone https://github.com/matheusabarbosa/digimon-cg-2020-cards.git
cd digimon-cg-2020-cards/digimon
pip install pillow
python baixar_imagens_digimon.py        # no Mac/Linux: python3
```

O script:

1. Baixa **primeiro as cartas que você tem** e **depois o resto** (cartas dos decks).
2. **Pula o que já existe** em `cartas/`, então pode rodar quantas vezes quiser.
3. Respeita o limite do site com uma pausa entre os downloads.
4. Lista no final os códigos que falharam, para baixar à mão.

### Pela planilha (o jeito normal)

1. Na planilha, aba **Update de Fotos**, use o menu *Digimon > Verificar fotos no repositório*.
2. Copie a coluna **F** inteira (da linha 2 até o `]`) com Ctrl+C.
3. Rode `python baixar_imagens_digimon.py` (dentro da pasta `digimon/`). Quando o script pedir, **cole a lista** (Ctrl+V). Ela termina sozinha no `]`.
4. O script baixa só essas cartas, converte para JPG e envia para o GitHub (`git add`, `commit`, `push`). Use `--sem-push` para só baixar.

Se apertar só Enter quando ele pedir a lista, o script usa o inventário e os decks (descritos abaixo).
Também dá para colar a lista direto no bloco `NOVAS_CARTAS` do script, ou ler de um arquivo: `python baixar_imagens_digimon.py --stdin < lista.txt`.
`python baixar_imagens_digimon.py --catalogo` baixa o catálogo inteiro (lento e pesado).

### Priorizar as cartas que você tem

Na planilha, abra a aba **INVENTÁRIO** e faça *Arquivo > Fazer download > Valores separados por vírgula (.csv)*. Salve o arquivo nesta pasta com o nome `inventario.csv`. As cartas com `Tenho > 0` são baixadas primeiro. Sem esse arquivo, o script usa o inventário que vem embutido nele.

O `inventario.csv` é pessoal e está no `.gitignore`, então não vai para o GitHub.

### Adicionar um deck novo

1. No digimoncard.io, abra o deck e use *Export > Text* (ou copie a lista da Liga Digimon).
2. Cole em um arquivo `.txt` dentro de `decks/` (por exemplo, `decks/meu-deck.txt`).
3. Rode o script de novo. Ele baixa só as imagens das cartas novas.

Os dois formatos de lista funcionam:

```
// DigimonCard.io Deck List
1 BanchoMamemon BT8-068
4 Chuumon (EX13-027)
```

Linhas de comentário (`//`) e linhas sem código de carta são ignoradas.

## Publicar as imagens novas

Depois de baixar, envie para o GitHub para a planilha enxergar (rode dentro da pasta `digimon/`):

```bash
git add cartas
git commit -m "Adiciona imagens de novas cartas"
git push
```

## Usar na planilha

Em uma coluna da planilha, com o código da carta na coluna B:

```
=IF(B2="","",IMAGE("https://raw.githubusercontent.com/matheusabarbosa/digimon-cg-2020-cards/main/digimon/cartas/"&B2&".jpg"))
```

O repositório precisa ser **público** para que as imagens apareçam.

## Avisos

- Digimon e as artes das cartas são marcas e direitos de seus detentores (Bandai, Toei Animation e outros). Este repositório não é afiliado nem endossado por eles.
- As imagens são baixadas do [DigimonCard.io](https://digimoncard.io), seguindo a orientação da documentação da API deles: baixar as imagens e servi-las de hospedagem própria, sem hotlink. O script usa pausas para respeitar o limite de requisições do site.
- Uso exclusivamente pessoal, para organização de coleção. Se algum detentor dos direitos pedir a remoção de conteúdo, as imagens serão removidas.
