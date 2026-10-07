/**
 * Controle de Decks — Digimon TCG
 * Script do Google Apps Script. Faz duas coisas:
 *   1) liga as fotos das cartas (função IMAGE) nas abas de faltas;
 *   2) trava as células que não devem ser editadas, deixando livres só as de entrada.
 *
 * COMO INSTALAR (uma vez por cópia da planilha):
 *   Extensões > Apps Script > apague o que estiver lá > cole este arquivo > Salvar.
 *   Recarregue a planilha. No menu "Digimon" > "Configurar planilha".
 *   O Google vai pedir autorização na primeira vez (é o seu próprio script, na sua planilha).
 */

// 'AVISO'    = qualquer pessoa vê um aviso e precisa confirmar para editar uma célula travada.
// 'RESTRITO' = só o dono da planilha edita as células travadas.
const MODO_PROTECAO = 'AVISO';

const DESC_PROTECAO = 'Digimon (célula calculada)';

// Células livres para edição (todo o resto de cada aba fica travado).
const ABAS_COM_ENTRADA = {
  'CONFIG': ['B2:B5'],
  'LISTAS': ['A1:T3', 'A5:T64'],
  'COMPRAS': ['A2:C2001', 'E2:G2001', 'I2:I2001'],
  'BULK': ['A1'],
  'MONTAR DECK': ['A1'],
  'FALTAS POR DECK': ['P1'],
  'FALTAS GERAL': ['M1'],
};
const ABAS_TRAVADAS = ['COMO USAR', 'INVENTÁRIO', 'DECKS', 'CONSOLIDADO',
                       'Update de Fotos', '_LEITURA', '_AUX'];

// Abas com foto: nome, coluna da foto, coluna do código, última linha.
const ABAS_FOTO = [
  { aba: 'FALTAS POR DECK', colFoto: 1, colCodigo: 3, ultima: 1201 },
  { aba: 'FALTAS GERAL',    colFoto: 1, colCodigo: 2, ultima: 801 },
];
const ALTURA_PADRAO = 21;

// Aba BULK: grade de fotos (5 colunas x 20 fileiras). O código de cada carta fica
// na coluna oculta I, linhas 2 a 101 (carta k na linha k+1).
const BULK = { aba: 'BULK', colunas: 5, fileiras: 20, colCodigo: 9, alturaLegenda: 54 };
// Aba MONTAR DECK: lista completa de um deck (5 colunas x 12 fileiras), mesmo esquema.
const MONTAR = { aba: 'MONTAR DECK', colunas: 5, fileiras: 12, colCodigo: 9, alturaLegenda: 58 };
const GRADES = [BULK, MONTAR];

// Separador de argumentos das fórmulas: ';' em planilhas pt-BR/es/de/fr..., ',' em en-US etc.
function sep_() {
  const loc = String(SpreadsheetApp.getActive().getSpreadsheetLocale() || 'en_US').toLowerCase();
  const virgula = /^(en|ja|zh|ko|th|he|hi|ms|id_|fil)/.test(loc);
  return virgula ? ',' : ';';
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Digimon')
    .addItem('Configurar planilha (fotos e proteção)', 'configurarPlanilha')
    .addItem('Atualizar fotos', 'atualizarFotos')
    .addItem('Verificar fotos no repositório', 'verificarFotosRepo')
    .addToUi();
  try { ajustarAlturas_(); } catch (err) { /* ignora: é só estética */ }
}

function configurarPlanilha() {
  const ss = SpreadsheetApp.getActive();
  ['_LEITURA', '_AUX'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && !s.isSheetHidden()) s.hideSheet();
  });
  atualizarFotos();
  configurarFiltroBulk_(ss);
  aplicarProtecao_(ss);
  SpreadsheetApp.getUi().alert(
    'Planilha configurada.\n\n' +
    '• Fotos: preencha a aba CONFIG (endereço base) e mude "Mostrar fotos?" para SIM quando as imagens estiverem no GitHub.\n' +
    '• Células calculadas travadas (modo ' + MODO_PROTECAO + ').');
}

function atualizarFotos() {
  const ss = SpreadsheetApp.getActive();
  ABAS_FOTO.forEach(function (c) {
    const sh = ss.getSheetByName(c.aba);
    if (!sh) return;
    const n = c.ultima - 1;
    const cod = columnLetter_(c.colCodigo);
    const formulas = [];
    for (let r = 2; r <= c.ultima; r++) {
      formulas.push([fotoFormula_(cod + r)]);
    }
    sh.getRange(2, c.colFoto, n, 1).setFormulas(formulas);
  });
  fotosBulk_(ss);
  ajustarAlturas_();
}

/**
 * Consulta o GitHub (CONFIG!B2 + código + CONFIG!B3) para cada carta da planilha e grava
 * "Tem foto" / "Sem foto" na aba Update de Fotos (colunas K:L, ocultas).
 * Cartas que já estão como "Tem foto" não são consultadas de novo.
 */
function verificarFotosRepo() {
  const ss = SpreadsheetApp.getActive();
  const up = ss.getSheetByName('Update de Fotos');
  const cfg = ss.getSheetByName('CONFIG');
  if (!up || !cfg) { SpreadsheetApp.getUi().alert('Aba "Update de Fotos" ou CONFIG não encontrada.'); return; }
  const base = String(cfg.getRange('B2').getValue());
  const ext = String(cfg.getRange('B3').getValue());
  const ultima = 801;
  const codigos = up.getRange(2, 1, ultima - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); }).filter(function (c) { return c !== ''; });

  const cache = {};
  up.getRange(2, 11, ultima - 1, 2).getValues().forEach(function (r) {
    if (r[0] !== '') cache[String(r[0])] = String(r[1]);
  });

  // Cartas já marcadas como "Tem foto" não são consultadas de novo (as fotos não são apagadas).
  // Se algum dia apagar fotos do repositório, limpe as colunas K:L (ocultas) de "Update de Fotos".
  const aConsultar = codigos.filter(function (c) { return cache[c] !== 'Tem foto'; });
  const LOTE = 40;
  let erros = 0;
  for (let i = 0; i < aConsultar.length; i += LOTE) {
    const lote = aConsultar.slice(i, i + LOTE);
    const reqs = lote.map(function (c) {
      return { url: base + encodeURIComponent(c) + ext, method: 'get', muteHttpExceptions: true, followRedirects: true };
    });
    const resp = UrlFetchApp.fetchAll(reqs);
    resp.forEach(function (r, k) {
      const cod = r.getResponseCode();
      if (cod === 200) cache[lote[k]] = 'Tem foto';
      else if (cod === 404) cache[lote[k]] = 'Sem foto';
      else { erros++; }   // erro temporário: mantém o resultado anterior
    });
  }
  const saida = [];
  codigos.forEach(function (c) { saida.push([c, cache[c] || 'Sem foto']); });
  up.getRange(2, 11, ultima - 1, 2).clearContent();
  if (saida.length) up.getRange(2, 11, saida.length, 2).setValues(saida);
  up.getRange('I5').setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
  SpreadsheetApp.getUi().alert('Verificação concluída: ' + codigos.length + ' cartas.' +
    (erros ? '\n' + erros + ' consulta(s) falharam (tente de novo mais tarde).' : ''));
}

function fotoFormula_(ref) {
  const S = sep_();
  // Se a verificação (menu Digimon > Verificar fotos no repositório) marcou "Sem foto",
  // mostra o aviso em vez de uma imagem quebrada.
  const semFoto = 'IFERROR(VLOOKUP(' + ref + S + '\'Update de Fotos\'!$K$2:$L$801' + S + '2' + S + '0)' + S + '"")="Sem foto"';
  return '=IF(OR(' + ref + '=""' + S + 'CONFIG!$B$4<>"SIM")' + S + '""' + S +
         'IF(' + semFoto + S + '"SEM FOTO"' + S + 'IMAGE(CONFIG!$B$2&' + ref + '&CONFIG!$B$3' + S + '1)))';
}

/** Fotos das abas em grade (BULK e MONTAR DECK): carta k na fileira (k-1)/5, coluna (k-1)%5. */
function fotosBulk_(ss) {
  GRADES.forEach(function (G) {
    const sh = ss.getSheetByName(G.aba);
    if (!sh) return;
    const cod = columnLetter_(G.colCodigo);
    for (let g = 0; g < G.fileiras; g++) {
      const linha = [];
      for (let cc = 0; cc < G.colunas; cc++) {
        const k = g * G.colunas + cc + 1;
        linha.push(fotoFormula_(cod + (k + 1)));
      }
      sh.getRange(2 + 2 * g, 1, 1, G.colunas).setFormulas([linha]);
    }
  });
}

/** Alturas das abas em grade: fileira da foto alta, legenda média, e fileiras vazias baixas. */
function alturasBulk_(ss, mostrar, altura) {
  GRADES.forEach(function (G) {
    const sh = ss.getSheetByName(G.aba);
    if (!sh) return;
    const total = G.colunas * G.fileiras;
    const cods = sh.getRange(2, G.colCodigo, total, 1).getDisplayValues();
    const pts = Math.round(altura * 0.75);
    for (let g = 0; g < G.fileiras; g++) {
      const tem = cods[g * G.colunas][0] !== '';
      sh.setRowHeightsForced(2 + 2 * g, 1, tem && mostrar ? pts : ALTURA_PADRAO);
      sh.setRowHeightsForced(3 + 2 * g, 1, tem ? G.alturaLegenda : ALTURA_PADRAO);
    }
  });
}

/** Ajusta a altura das linhas: alta onde há foto, normal no resto. */
function ajustarAlturas_() {
  const ss = SpreadsheetApp.getActive();
  const cfg = ss.getSheetByName('CONFIG');
  const mostrar = cfg && String(cfg.getRange('B4').getValue()).toUpperCase() === 'SIM';
  const altura = Math.max(30, Number(cfg ? cfg.getRange('B5').getValue() : 200) || 200);
  SpreadsheetApp.flush();
  alturasBulk_(ss, mostrar, altura);
  ABAS_FOTO.forEach(function (c) {
    const sh = ss.getSheetByName(c.aba);
    if (!sh) return;
    const total = c.ultima - 1;
    const valores = sh.getRange(2, c.colCodigo, total, 1).getDisplayValues();
    let usadas = 0;
    while (usadas < total && valores[usadas][0] !== '') usadas++;
    const h = mostrar ? altura : ALTURA_PADRAO;
    if (usadas > 0) sh.setRowHeightsForced(2, usadas, h);
    if (total - usadas > 0) sh.setRowHeightsForced(2 + usadas, total - usadas, ALTURA_PADRAO);
  });
}

/** Mantém a altura certa quando o conteúdo muda (colar deck, registrar compra...). */
function onEdit(e) {
  try {
    const nome = e.range.getSheet().getName();
    if (nome === 'BULK' && e.range.getA1Notation() === 'A1') multiSelecionar_(e);
    if (['LISTAS', 'COMPRAS', 'CONFIG', 'BULK', 'MONTAR DECK', 'FALTAS POR DECK', 'FALTAS GERAL'].indexOf(nome) >= 0) ajustarAlturas_();
  } catch (err) { /* ignora: é só estética */ }
}

// ---- BULK: filtro com vários decks --------------------------------------------------
const TODAS_ = '(Todas as cartas)';

/** A1 da BULK aceita valores fora da lista (a lista de decks fica em O2:O22, oculta). */
function configurarFiltroBulk_(ss) {
  const sh = ss.getSheetByName(BULK.aba);
  if (!sh) return;
  const regra = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange('O2:O22'), true)
    .setAllowInvalid(true)
    .build();
  sh.getRange('A1').setDataValidation(regra);
}

/**
 * Multi-seleção: cada vez que um deck é escolhido na lista, ele é ligado ou desligado
 * no conjunto já escolhido (nomes separados por ", ").
 * "(Todas as cartas)" substitui o resto; escolher um deck tira o "(Todas as cartas)".
 */
function multiSelecionar_(e) {
  const sh = e.range.getSheet();
  const novo = String(e.value === undefined ? '' : e.value).trim();
  if (novo === '') return;                         // apagou a célula: deixa vazio
  const opcoes = sh.getRange('O2:O22').getValues()
    .map(function (r) { return String(r[0]).trim(); }).filter(function (v) { return v !== ''; });
  if (opcoes.indexOf(novo) < 0) return;            // texto digitado à mão: respeita
  const antigo = String(e.oldValue === undefined ? '' : e.oldValue).trim();
  let itens = antigo === '' ? [] : antigo.split(', ').map(function (v) { return v.trim(); })
    .filter(function (v) { return v !== ''; });
  if (novo === TODAS_) {
    itens = (itens.length === 1 && itens[0] === TODAS_) ? [] : [TODAS_];
  } else {
    itens = itens.filter(function (v) { return v !== TODAS_; });
    const i = itens.indexOf(novo);
    if (i >= 0) itens.splice(i, 1); else itens.push(novo);
  }
  e.range.setValue(itens.join(', '));
}

function aplicarProtecao_(ss) {
  // remove proteções antigas feitas por este script
  ss.getSheets().forEach(function (s) {
    s.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
      if (p.getDescription() === DESC_PROTECAO) p.remove();
    });
  });
  const dono = Session.getEffectiveUser();

  Object.keys(ABAS_COM_ENTRADA).forEach(function (nome) {
    const s = ss.getSheetByName(nome);
    if (!s) return;
    const livres = ABAS_COM_ENTRADA[nome].map(function (a1) { return s.getRange(a1); });
    protegerAba_(s, livres, dono);
  });
  ABAS_TRAVADAS.forEach(function (nome) {
    const s = ss.getSheetByName(nome);
    if (s) protegerAba_(s, [], dono);
  });
}

function protegerAba_(sheet, rangesLivres, dono) {
  const p = sheet.protect().setDescription(DESC_PROTECAO);
  if (rangesLivres.length) p.setUnprotectedRanges(rangesLivres);
  if (MODO_PROTECAO === 'AVISO') {
    p.setWarningOnly(true);
  } else {
    p.addEditor(dono);
    const outros = p.getEditors().filter(function (u) { return u.getEmail() !== dono.getEmail(); });
    if (outros.length) p.removeEditors(outros);
    if (p.canDomainEdit()) p.setDomainEdit(false);
  }
}

function columnLetter_(col) {
  let s = '';
  while (col > 0) {
    const m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = Math.floor((col - m) / 26);
  }
  return s;
}
