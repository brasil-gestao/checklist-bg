/* Checklist BG — aplicativo de checklist da Brasil Gestão
   A estrutura (contratos, turnos, nomes, checklists, campos e itens) vem da planilha-mestre,
   entregue pelo receptor do Google (ENDPOINT). Sem ENDPOINT e com config_demo.js, roda em demonstração. */
const VERSAO_APP = "0.7.1";
const ENDPOINT = "https://script.google.com/macros/s/AKfycbxqprpvQazbTNF9wAdGRIJA-wSmx_kWhV6sgCiiZ21D2Gn7yy2Wl4Cgpq3XWRiWHohu7w/exec"; // endereço do receptor (Google Apps Script) — preenchido na ligação
const MODO_DEMO = !!window.CONFIG_DEMO;

/* ===== Guardar no celular (IndexedDB, com reserva em memória) ===== */
const mem = { fila: [], cfg: null };
let db = null;
function abrirDB() { return new Promise(res => { try { const r = indexedDB.open("checklist_bg", 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("fila", { keyPath: "id" }); d.createObjectStore("cfg"); };
  r.onsuccess = () => { db = r.result; res(); }; r.onerror = () => res(); } catch (e) { res(); } }); }
function tx(store, modo, fn) { return new Promise(res => { if (!db) return res(null);
  try { const t = db.transaction(store, modo); const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : null); t.onerror = () => res(null); } catch (e) { res(null); } }); }
async function filaListar() { if (!db) return mem.fila; return (await tx("fila", "readonly", s => s.getAll())) || []; }
async function filaSalvar(reg) { if (!db) { const i = mem.fila.findIndex(r => r.id === reg.id); i >= 0 ? mem.fila[i] = reg : mem.fila.push(reg); return; } await tx("fila", "readwrite", s => s.put(reg)); }
/* Ativação e lista também ficam numa cópia de reserva (localStorage), para não pedir ativação de novo */
function lsLer(k) { try { const t = localStorage.getItem("bg_" + k); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
function lsSalvar(k, v) { try { localStorage.setItem("bg_" + k, JSON.stringify(v)); } catch (e) {} }
async function cfgLer(k) { let v = db ? await tx("cfg", "readonly", s => s.get(k)) : mem[k]; if (v == null) v = lsLer(k); return v; }
async function cfgSalvar(k, v) { lsSalvar(k, v); if (!db) { mem[k] = v; return; } await tx("cfg", "readwrite", s => s.put(v, k)); }

/* ===== Utilidades ===== */
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...filhos) => { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v); }
  for (const f of filhos.flat()) { if (f == null) continue; e.append(f.nodeType ? f : document.createTextNode(f)); } return e; };
const agoraISO = () => new Date().toISOString();
const horaLocal = d => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const horaCompleta = d => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const opcoes = s => String(s || "").split(";").map(x => x.trim()).filter(Boolean);
async function sha256(t) { try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); } catch (e) { return ""; } }
const SIT = { C: "Conforme", N: "Não conforme", A: "Não se aplica" };

/* ===== Estado ===== */
let CFG = null, cfgEm = null, CHAVE = "";
const S = { contrato: "", matricula: "", nome: "", turno: "", inicioSessao: null, ck: null, inicio: null, cab: {}, resp: {}, foto: null, fotoEm: null };

/* ===== Lista (planilha-mestre) ===== */
async function carregarConfig() {
  if (MODO_DEMO) { CFG = window.CONFIG_DEMO; return; }
  const salva = await cfgLer("atual"); CHAVE = (await cfgLer("chave")) || "";
  if (salva && salva.cfg) { CFG = salva.cfg; cfgEm = salva.em; }
  if (CHAVE && navigator.onLine) await baixarConfig(CHAVE);
}
/* Ativação: código + matrícula + número do celular, depois a declaração (termo) aceita */
async function postAtivacao(dados) {
  try { const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(dados) });
    return await r.json(); } catch (e) { return { ok: false, erro: "rede" }; }
}
const TERMO_CORP = "CORPORATIVO-1.0", TERMO_VOL = "VOLUNTARIO-1.1";
function textoTermo(vol, nome, mat, tel) {
  if (!vol) return ["Declaro que este aparelho é o celular corporativo da base, de propriedade da Brasil Gestão, e que estou ativando o aplicativo Checklist BG para uso exclusivo no trabalho.",
    "Nome: " + nome + " · Matrícula: " + mat + " · Celular informado: " + tel];
  return ["TERMO DE INSTALAÇÃO VOLUNTÁRIA EM CELULAR PARTICULAR",
    "Eu, " + nome + ", matrícula " + mat + ", declaro, para os devidos fins, que:",
    "1. O número que informei (" + tel + ") não é o do celular corporativo da base. Estou instalando o aplicativo Checklist BG em celular de minha propriedade, por minha livre e espontânea vontade, sem pedido, ordem ou exigência da Brasil Gestão.",
    "2. A instalação no meu celular tem como finalidade teste, treinamento, familiarização com o aplicativo e outros, por iniciativa minha.",
    "3. Tenho ciência de que a Brasil Gestão disponibiliza o celular corporativo da base para fazer os checklists e de que posso usá-lo a qualquer momento, sem nenhum prejuízo por não usar o meu celular.",
    "4. Tenho ciência de que o aplicativo funciona sem internet e de que o envio pode ser feito pela rede Wi-Fi do local de trabalho, sem necessidade de usar o meu pacote de dados. Se eu usar meus dados móveis, será por escolha própria.",
    "5. A instalação é opcional. Não fui obrigado a instalar e posso desinstalar o aplicativo e pedir ao supervisor o bloqueio deste aparelho a qualquer momento.",
    "6. Estou ciente de que o número informado, a minha matrícula, a data e a hora desta ativação ficam registrados como prova desta declaração, e de que informar um número falso é uma declaração falsa.",
    "Declaro que li todo este termo e concordo com ele."];
}
async function baixarConfig(chave) {
  try { const r = await fetch(ENDPOINT + "?acao=config&chave=" + encodeURIComponent(chave), { cache: "no-store" });
    const c = await r.json(); if (c && c.versao_lista) { CFG = c; cfgEm = agoraISO(); CHAVE = chave; await cfgSalvar("atual", { cfg: c, em: cfgEm }); await cfgSalvar("chave", chave); return true; }
  } catch (e) {} return false;
}
function textoFaixa() {
  $("#faixa").textContent = MODO_DEMO ? "Demonstração · lista " + CFG.versao_lista + " · app " + VERSAO_APP
    : (cfgEm ? "Lista atualizada " + horaLocal(cfgEm) : "Lista do aparelho") + " · versão " + (CFG ? CFG.versao_lista : "—") + " · app " + VERSAO_APP;
}

/* ===== Fila de envio ===== */
async function atualizarChip() {
  const n = (await filaListar()).filter(r => r.situacao !== "enviado").length;
  const c = $("#filaChip"); c.textContent = n ? n + " aguardando envio" : "Fila vazia"; c.classList.toggle("tem", n > 0);
}
let enviando = false;
async function enviarFila() {
  if (enviando) return; enviando = true;
  try { for (const reg of (await filaListar()).filter(r => r.situacao !== "enviado")) {
      if (MODO_DEMO) { reg.situacao = "enviado"; reg.enviado_em = agoraISO(); await filaSalvar(reg); continue; }
      if (!navigator.onLine) break;
      try { const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ chave: CHAVE }, reg.payload)) });
        const j = await r.json().catch(() => ({}));
        if (j.ok) { reg.situacao = "enviado"; reg.enviado_em = agoraISO(); reg.payload = { id: reg.payload.id }; await filaSalvar(reg); } else break;
      } catch (e) { break; } }
  } finally { enviando = false; atualizarChip(); }
}
window.addEventListener("online", enviarFila);

/* ===== Câmera (foto só tirada na hora, dentro do app) ===== */
let fluxo = null;
function pararCamera() { if (fluxo) { fluxo.getTracks().forEach(t => t.stop()); fluxo = null; } }
function camera(fotoAtual, aoBater, rotuloSimular) {
  const prev = el("img", { alt: "Foto", hidden: !fotoAtual, src: fotoAtual || "" });
  const video = el("video", { playsinline: true, muted: true, autoplay: true, hidden: true });
  const msg = el("p", { class: "info", style: "margin:0", hidden: true });
  const bater = el("button", { class: "btn btn-pri", hidden: true, type: "button", onclick: baterFoto }, "Bater a foto");
  const abrir = el("button", { class: "btn btn-sec", type: "button", onclick: abrirCam }, fotoAtual ? "Bater outra foto" : "Abrir a câmera");
  const simular = el("button", { class: "btn btn-sec", hidden: true, type: "button", onclick: () => {
    const cv = document.createElement("canvas"); cv.width = 640; cv.height = 420; const g = cv.getContext("2d");
    g.fillStyle = "#1F273F"; g.fillRect(0, 0, 640, 420); g.fillStyle = "#3DD84B"; g.fillRect(0, 380, 640, 40);
    g.fillStyle = "#fff"; g.font = "bold 34px sans-serif"; g.fillText("FOTO SIMULADA", 170, 190); g.font = "22px sans-serif"; g.fillText(new Date().toLocaleString("pt-BR"), 200, 235);
    terminar(cv.toDataURL("image/jpeg", 0.8)); simular.hidden = true; msg.hidden = true; } }, "Usar foto simulada (só na prévia)");
  async function abrirCam() { msg.hidden = true; pararCamera();
    try { fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = fluxo; video.hidden = false; bater.hidden = false; abrir.hidden = true; prev.hidden = true;
    } catch (e) {
      msg.textContent = MODO_DEMO ? "Na prévia a câmera não abre. No celular ela abre aqui dentro do app e só deixa bater a foto na hora." : "Não foi possível abrir a câmera. Libere a câmera para o app nas configurações do celular e tente de novo.";
      msg.hidden = false; if (MODO_DEMO) simular.hidden = false; } }
  function baterFoto() { const w = video.videoWidth || 1280, h = video.videoHeight || 720, k = Math.min(1, 1280 / Math.max(w, h));
    const cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k); cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
    pararCamera(); video.hidden = true; bater.hidden = true; terminar(cv.toDataURL("image/jpeg", 0.72)); }
  function terminar(dados) { prev.src = dados; prev.hidden = false; abrir.hidden = false; abrir.textContent = "Bater outra foto"; aoBater(dados, agoraISO()); }
  return el("div", { class: "camera" }, video, prev, msg, bater, abrir, simular);
}

/* ===== Telas ===== */
function barra(...b) { $("#barraDentro").replaceChildren(...b); $("#barra").hidden = b.length === 0; }
function tela(...filhos) { pararCamera(); $("#tela").replaceChildren(...filhos); window.scrollTo(0, 0); }

/* No iPhone, o Safari e o app instalado guardam dados separados: só deixa ativar pelo ícone */
const ehIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const estaInstalado = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
function telaAtivar() {
  barra();
  if (!MODO_DEMO && ehIOS() && !estaInstalado()) {
    return tela(el("div", {}, el("h1", {}, "Instale antes de ativar"),
        el("p", { class: "sub" }, "No iPhone, o Checklist BG só pode ser ativado pelo ícone na tela inicial. O que for feito aqui no Safari não aparece no aplicativo.")),
      el("div", { class: "bloco" }, el("ol", { style: "margin:0;padding-left:20px;display:grid;gap:8px" },
        el("li", {}, "Toque em ", el("strong", {}, "Compartilhar"), " (quadrado com seta para cima), na barra do Safari."),
        el("li", {}, "Escolha ", el("strong", {}, "Adicionar à Tela de Início"), " e toque em ", el("strong", {}, "Adicionar"), "."),
        el("li", {}, el("strong", {}, "Feche o Safari"), " e abra o Checklist BG pelo ícone."),
        el("li", {}, "No aplicativo, digite o código de ativação."))));
  }
  const soNum = e => { e.target.value = e.target.value.replace(/\D/g, ""); };
  const cod = el("input", { type: "text", id: "codigo", autocomplete: "off", placeholder: "Código de ativação" });
  const mat = el("input", { type: "text", id: "mat", inputmode: "numeric", maxlength: "6", autocomplete: "off", placeholder: "Sua matrícula (6 números)", oninput: soNum });
  const tel = el("input", { type: "tel", id: "tel", inputmode: "numeric", maxlength: "13", autocomplete: "off", placeholder: "DDD + número", oninput: soNum });
  const erro = el("div", { class: "erro", hidden: true });
  const msgErro = { expirado: "Este código já venceu (vale 2 dias). Peça um código novo ao supervisor.", matricula: "Matrícula não encontrada ou inativa. Confira com o supervisor.",
    telefone: "Digite o número deste celular com DDD.", rede: "Sem conexão com o servidor. Tente de novo.", termo: "É preciso ler e aceitar a declaração." };
  const ok = el("button", { class: "btn btn-pri", onclick: async () => {
    const f = [];
    if (!cod.value.trim()) f.push("Digite o código de ativação.");
    if (mat.value.length < 1) f.push("Digite a sua matrícula.");
    if (tel.value.length < 10) f.push("Digite o número deste celular com DDD.");
    if (f.length) { erro.replaceChildren(el("ul", {}, f.map(t => el("li", {}, t)))); erro.hidden = false; return; }
    if (!navigator.onLine) { erro.textContent = "Sem internet. Para ativar, o celular precisa estar conectado."; erro.hidden = false; return; }
    ok.disabled = true; ok.textContent = "Conferindo…";
    const dados = { codigo: cod.value.trim().toUpperCase(), matricula: mat.value.padStart(6, "0"), telefone: tel.value };
    const j = await postAtivacao(Object.assign({ acao: "checar_ativacao" }, dados));
    if (j && j.ok) return telaTermo(dados, j.nome, !j.celular_da_base);
    erro.textContent = msgErro[j && j.erro] || "Código não aceito. Confira com o supervisor e tente de novo.";
    erro.hidden = false; ok.disabled = false; ok.textContent = "Continuar"; } }, "Continuar");
  tela(el("div", {}, el("h1", {}, "Ativar o celular da base"), el("p", { class: "sub" }, "Faça uma vez só, com internet. Peça o código ao supervisor por e-mail; ele vale 2 dias.")),
    el("div", { class: "bloco" }, el("label", { class: "rot", for: "codigo" }, "Código de ativação"), cod,
      el("label", { class: "rot", for: "mat" }, "Sua matrícula"), mat,
      el("label", { class: "rot", for: "tel" }, "Número deste celular (com DDD)"), tel), erro, ok);
}

/* Declaração: celular da base = declaração curta; outro número = termo de instalação voluntária, que precisa ser lido até o fim */
function telaTermo(dados, nome, vol) {
  barra();
  const linhas = textoTermo(vol, nome, dados.matricula, dados.telefone);
  const caixa = el("div", { class: "termo" + (vol ? " longo" : "") }, linhas.map((t, i) => el("p", i === 0 && vol ? { class: "termo-tit" } : {}, t)));
  const aceite = el("input", { type: "checkbox", id: "aceite", disabled: vol ? true : null });
  const dica = el("p", { class: "info", style: "margin:0" }, vol ? "Role o texto até o fim para liberar o aceite." : "");
  const liberar = () => { if (caixa.scrollTop + caixa.clientHeight >= caixa.scrollHeight - 6) { aceite.disabled = false; dica.textContent = ""; } };
  if (vol) { caixa.addEventListener("scroll", liberar); setTimeout(liberar, 300); }
  const erro = el("div", { class: "erro", hidden: true });
  const ok = el("button", { class: "btn btn-pri", onclick: async () => {
    if (!aceite.checked) { erro.textContent = vol ? "Leia o termo até o fim e marque \"Li e concordo\"." : "Marque \"Li e concordo\"."; erro.hidden = false; return; }
    ok.disabled = true; ok.textContent = "Ativando…";
    const j = await postAtivacao(Object.assign({ acao: "ativar", termo: vol ? TERMO_VOL : TERMO_CORP, aceite: true }, dados));
    if (j && j.ok && j.token && await baixarConfig(j.token)) { textoFaixa(); return telaInicio(); }
    erro.textContent = j && j.erro === "expirado" ? "Este código já venceu. Peça um código novo ao supervisor." : "Não foi possível ativar. Confira com o supervisor e tente de novo.";
    erro.hidden = false; ok.disabled = false; ok.textContent = "Ativar este celular"; } }, "Ativar este celular");
  tela(el("button", { class: "voltar", onclick: telaAtivar }, "‹ Voltar"),
    el("div", {}, el("h1", {}, vol ? "Este não é o celular da base" : "Declaração"),
      el("p", { class: "sub" }, vol ? "O número informado não é o do celular corporativo da base. Para continuar, leia e aceite o termo abaixo." : "Confirme que este é o celular corporativo da base.")),
    caixa, dica, el("label", { class: "decl", for: "aceite" }, aceite, el("span", {}, "Li e concordo")), erro, ok);
}

function telaInicio() {
  barra();
  if (!S.contrato) S.contrato = CFG.contratos[0].id;
  const turnos = CFG.turnos.filter(t => t.contrato === S.contrato);
  const funcs = CFG.funcionarios.filter(f => f.contrato === S.contrato).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const mat = el("strong", {}, S.matricula || "—");
  const erro = el("div", { class: "erro", hidden: true });
  const selContrato = el("select", { id: "contrato", onchange: e => { S.contrato = e.target.value; S.matricula = ""; S.turno = ""; telaInicio(); } },
    CFG.contratos.map(c => el("option", { value: c.id, selected: c.id === S.contrato }, c.nome)));
  const selNome = el("select", { id: "nome", onchange: e => { const f = funcs.find(x => x.matricula === e.target.value); S.matricula = f ? f.matricula : ""; S.nome = f ? f.nome : ""; if (f && !S.inicioSessao) S.inicioSessao = agoraISO(); mat.textContent = S.matricula || "—"; erro.hidden = true; } },
    el("option", { value: "" }, "Escolha o seu nome"), funcs.map(f => el("option", { value: f.matricula, selected: f.matricula === S.matricula }, f.nome)));
  const selTurno = el("select", { id: "turno", onchange: e => { S.turno = e.target.value; erro.hidden = true; } },
    el("option", { value: "" }, "Escolha o turno de hoje"), turnos.map(t => el("option", { value: t.id, selected: t.id === S.turno }, t.nome)));
  const seguir = el("button", { class: "btn btn-pri", onclick: () => {
    const f = []; if (!S.matricula) f.push("Escolha o seu nome."); if (!S.turno) f.push("Escolha o turno.");
    if (f.length) { erro.replaceChildren("Antes de continuar:", el("ul", {}, f.map(t => el("li", {}, t)))); erro.hidden = false; return; }
    telaEscolha(); } }, "Continuar");
  tela(MODO_DEMO ? el("div", { class: "demo" }, "Demonstração: nada é enviado de verdade.") : null,
    el("div", {}, el("h1", {}, "Identificação"), el("p", { class: "sub" }, "Escolha o contrato, o seu nome e o turno em que está trabalhando.")),
    el("div", { class: "bloco" },
      el("div", {}, el("label", { class: "rot", for: "contrato" }, "Contrato"), selContrato),
      el("div", {}, el("label", { class: "rot", for: "nome" }, "Seu nome"), selNome, el("p", { class: "info", style: "margin:6px 0 0" }, "Matrícula: ", mat)),
      el("div", {}, el("label", { class: "rot", for: "turno" }, "Turno"), selTurno)),
    erro, seguir, el("button", { class: "btn btn-sec", onclick: telaFila }, "Ver fila de envio"));
}

/* Plantão = contrato + data do início do turno + turno + checklist (+ bombeiro, quando é 1 por bombeiro).
   O turno da noite (19h–7h) continua sendo o mesmo plantão depois da meia-noite. */
function dataPlantao(turnoId, iso) {
  const t = (CFG.turnos || []).find(x => x.id === turnoId) || {};
  const [h, m] = String(t.inicio || "00:00").split(":").map(Number);
  const d = new Date(iso || Date.now());
  if (d.getHours() * 60 + d.getMinutes() < h * 60 + (m || 0) - 120) d.setDate(d.getDate() - 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function chavePlantao(c, matricula, turnoId, iso) { return [S.contrato, dataPlantao(turnoId, iso), turnoId, c.id].concat(c.por_bombeiro ? [matricula] : []).join("|"); }

async function telaEscolha() {
  barra();
  const t = CFG.turnos.find(x => x.id === S.turno);
  const permitidos = t.checklists === "todos" ? null : t.checklists.split(",").map(s => s.trim());
  const lista = CFG.checklists.filter(c => c.contrato === S.contrato && (!permitidos || permitidos.includes(c.id)));
  const fila = await filaListar();
  const aviso = el("div", { class: "aviso", hidden: true });
  tela(el("button", { class: "voltar", onclick: telaInicio }, "‹ Voltar"),
    el("div", {}, el("h1", {}, "Qual checklist?"), el("p", { class: "sub" }, S.nome + " · " + t.nome + " · prazo até " + t.prazo.replace(":00", "h"))),
    aviso,
    el("div", { class: "lista-check" }, lista.map(c => {
      const n = CFG.itens.filter(i => i.checklist === c.id).length;
      const chave = chavePlantao(c, S.matricula, S.turno);
      const feito = fila.find(r => r.checklist_id === c.id && (r.plantao || chavePlantao(c, r.matricula, r.turno, r.criado_em)) === chave);
      const quem = feito ? (feito.nome || String(feito.resumo || "").split(" · ")[1] || "") : "";
      const abrir = feito ? () => {
        aviso.replaceChildren(el("strong", {}, c.nome + ": já realizado neste plantão"), el("br"),
          (quem ? "Feito por " + quem + " às " + horaLocal(feito.criado_em) + ". " : "") + "Não é preciso fazer de novo. Se o primeiro teve erro, fale com o supervisor para liberar uma nova inspeção.");
        aviso.hidden = false; aviso.scrollIntoView({ behavior: "smooth", block: "center" }); } : () => abrirChecklist(c);
      return el("button", { class: "cartao-check" + (feito ? " feito" : ""), "aria-disabled": feito ? "true" : null, onclick: abrir },
        el("div", {}, el("div", { class: "nome" }, c.nome), el("div", { class: "det" }, feito ? "Já realizado neste plantão" + (quem ? " · " + quem : "") : n + " itens · " + c.quantos)),
        el("span", { class: "seta", "aria-hidden": "true" }, feito ? "✓" : "›"));
    })));
}

function abrirChecklist(c) { S.ck = c; S.inicio = agoraISO(); S.cab = {}; S.resp = {}; S.foto = null; S.fotoEm = null; telaItens(); }

function campoEntrada(id, tipo, ops, valor, aoMudar, rotulo) {
  if (tipo === "lista") return el("select", { id, onchange: e => aoMudar(e.target.value) }, el("option", { value: "" }, "Escolha"), opcoes(ops).map(o => el("option", { value: o, selected: o === valor }, o)));
  if (tipo === "numero") return el("input", { id, inputmode: "numeric", pattern: "[0-9]*", autocomplete: "off", value: valor ?? "", placeholder: "Só números", "aria-label": rotulo,
    oninput: e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 9); aoMudar(e.target.value); } });
  return el("textarea", { id, oninput: e => aoMudar(e.target.value), "aria-label": rotulo }, valor || "");
}

function telaItens() {
  const c = S.ck, itens = CFG.itens.filter(i => i.checklist === c.id), campos = (CFG.campos || []).filter(f => f.checklist === c.id);
  const prog = el("span", { class: "progresso" });
  const resumo = el("div", { class: "erro", hidden: true });
  const caixas = {};
  function problemasItem(it) {
    const r = S.resp[it.id] || {}, f = [];
    if (it.tipo === "quantidade_status") { if (r.qtd === undefined || r.qtd === "") f.push("Falta a quantidade."); }
    if (it.tipo === "quantidade_status" || it.tipo === "status") {
      if (!r.sit) f.push(c.na ? "Escolha Conforme, Não conforme ou Não se aplica." : "Escolha Conforme ou Não conforme.");
      if (it.tipo === "quantidade_status" && r.sit === "C" && r.qtd === "0") f.push("Quantidade zero não pode ser Conforme. Se está faltando, marque Não conforme e descreva.");
      if (r.sit === "N" && (r.desc || "").trim().length < 3) f.push("Descreva a não conformidade.");
      if (r.sit === "N" && c.foto_nc && !r.foto) f.push("Bata a foto da não conformidade.");
    } else if (it.tipo === "lista") {
      if (!r.valor) f.push("Escolha uma opção.");
      if (r.valor && opcoes(it.texto_se).includes(r.valor) && (r.desc || "").trim().length < 5) f.push("Explique o motivo (pelo menos 5 letras).");
    } else if (it.tipo === "numero") { if (!r.valor) f.push("Falta o número."); }
    else if (it.tipo === "texto") { if (!(r.valor || "").trim()) f.push("Falta preencher."); }
    return f;
  }
  function problemasCampo(cp) { return cp.obrigatorio && !(S.cab[cp.id] || "").toString().trim() ? [cp.tipo === "lista" ? "Escolha " + cp.rotulo.toLowerCase() + "." : "Falta " + cp.rotulo.toLowerCase() + "."] : []; }
  function atualizar() { const ok = itens.filter(i => problemasItem(i).length === 0).length; prog.textContent = ok + " de " + itens.length; if (!resumo.hidden) conferir(true); }
  function conferir(silencioso) {
    const lista = [];
    campos.forEach(cp => { const f = problemasCampo(cp), b = caixas["c_" + cp.id]; b.msg.hidden = !f.length; b.msg.textContent = f.join(" "); b.card.classList.toggle("erro-item", f.length > 0); if (f.length) lista.push(cp.rotulo + ": " + f[0]); });
    itens.forEach((it, idx) => { const f = problemasItem(it), b = caixas[it.id]; b.msg.hidden = !f.length; b.msg.textContent = f.join(" "); b.card.classList.toggle("erro-item", f.length > 0); if (f.length) lista.push(String(idx + 1).padStart(2, "0") + " · " + it.nome + ": " + f[0]); });
    if (!lista.length) { resumo.hidden = true; if (silencioso !== true) telaFinal(); return; }
    resumo.replaceChildren("Antes de seguir, corrija " + (lista.length === 1 ? "este ponto:" : "estes " + lista.length + " pontos:"), el("ul", {}, lista.slice(0, 12).map(t => el("li", {}, t)), lista.length > 12 ? el("li", {}, "e mais " + (lista.length - 12) + "…") : null));
    resumo.hidden = false; if (silencioso !== true) resumo.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const cabCards = campos.map(cp => {
    const msg = el("p", { class: "falta", hidden: true });
    const card = el("div", { class: "bloco" }, el("label", { class: "rot", for: "cab_" + cp.id }, cp.rotulo),
      campoEntrada("cab_" + cp.id, cp.tipo, cp.opcoes, S.cab[cp.id], v => { S.cab[cp.id] = v; atualizar(); }, cp.rotulo), msg);
    caixas["c_" + cp.id] = { card, msg }; return card;
  });
  let blocoAtual = null; const corpo = [];
  itens.forEach((it, idx) => {
    if (it.bloco !== blocoAtual) { blocoAtual = it.bloco; corpo.push(el("h2", { class: "bloco-titulo" }, it.bloco)); }
    const r = S.resp[it.id] = S.resp[it.id] || {};
    const card = el("div", { class: "item" + (r.sit === "C" ? " ok" : r.sit === "N" ? " nc" : r.sit === "A" ? " na" : "") });
    const msg = el("p", { class: "falta", hidden: true }); caixas[it.id] = { card, msg };
    const topo = el("div", { class: "item-topo" }, el("span", { class: "item-num" }, String(idx + 1).padStart(2, "0")), el("span", { class: "item-nome" }, it.nome));
    if (it.tipo === "quantidade_status" || it.tipo === "status") {
      const fotoNc = c.foto_nc ? el("div", { class: "foto-nc" }, el("p", { class: "info", style: "margin:0" }, "Foto da não conformidade"),
        camera(r.foto, (d, em) => { r.foto = d; r.fotoEm = em; atualizar(); })) : null;
      const desc = el("div", { class: "desc", hidden: r.sit !== "N" },
        el("label", { for: "d_" + it.id }, "Descreva a não conformidade"),
        el("textarea", { id: "d_" + it.id, placeholder: "Ex.: falta 1 unidade; peça rasgada; cilindro vazio", oninput: e => { r.desc = e.target.value; atualizar(); } }, r.desc || ""), fotoNc);
      const botoes = [["C", "ok"], ["N", "nc"]].concat(c.na ? [["A", "na"]] : []).map(([v, cl]) =>
        el("button", { class: cl, type: "button", "aria-pressed": String(r.sit === v), onclick: () => escolher(v) }, SIT[v]));
      function escolher(v) { r.sit = v; botoes.forEach(b => b.setAttribute("aria-pressed", String(b.textContent === SIT[v])));
        card.classList.toggle("ok", v === "C"); card.classList.toggle("nc", v === "N"); card.classList.toggle("na", v === "A");
        desc.hidden = v !== "N"; if (v === "N") desc.querySelector("textarea").focus(); atualizar(); }
      const sit = el("div", { class: "sit" + (c.na ? " tres" : "") }, botoes);
      const linha = it.tipo === "quantidade_status"
        ? el("div", { class: "linha-resp" }, el("div", { class: "qtd" }, el("input", { id: "q_" + it.id, inputmode: "numeric", pattern: "[0-9]*", autocomplete: "off", "aria-label": "Quantidade de " + it.nome, value: r.qtd ?? "", placeholder: "Qtd",
            oninput: e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); r.qtd = e.target.value; atualizar(); } })), sit)
        : sit;
      card.append(topo, linha, desc, msg);
    } else {
      const extra = el("div", { class: "desc", hidden: !opcoes(it.texto_se).includes(r.valor) },
        el("label", { for: "x_" + it.id }, "Explique o motivo"), el("textarea", { id: "x_" + it.id, oninput: e => { r.desc = e.target.value; atualizar(); } }, r.desc || ""));
      card.append(topo, campoEntrada("v_" + it.id, it.tipo, it.opcoes, r.valor, v => { r.valor = v; extra.hidden = !opcoes(it.texto_se).includes(v); atualizar(); }, it.nome), extra, msg);
    }
    corpo.push(card);
  });
  const aviso = el("div", { class: "aviso", hidden: true }, "Você já começou este checklist. Termine e envie antes de trocar, ou ",
    el("button", { class: "voltar", style: "display:inline;color:inherit;text-decoration:underline", onclick: telaEscolha }, "descarte e troque"), ".");
  tela(el("button", { class: "voltar", onclick: () => { if (Object.values(S.resp).some(r => r.qtd || r.sit || r.valor) || Object.keys(S.cab).length) aviso.hidden = false; else telaEscolha(); } }, "‹ Trocar de checklist"),
    aviso,
    el("div", {}, el("h1", {}, c.nome), el("p", { class: "sub" }, c.orientacao || "")),
    el("div", { class: "bloco data-fixa" }, el("span", { class: "info" }, "Inspeção iniciada em"), el("strong", {}, horaCompleta(S.inicio))),
    resumo, ...cabCards, ...corpo);
  barra(prog, el("button", { class: "btn btn-pri", onclick: () => conferir() }, "Ir para a foto e envio"));
  atualizar();
}

function telaFinal() {
  barra();
  const c = S.ck;
  const pin = el("input", { type: "password", id: "pin", inputmode: "numeric", autocomplete: "off", maxlength: "6", placeholder: "Sua senha de 6 números", oninput: e => { e.target.value = e.target.value.replace(/\D/g, ""); revalidar(); } });
  const decl = el("input", { type: "checkbox", id: "decl", onchange: () => revalidar() });
  const erro = el("div", { class: "erro", hidden: true });
  function faltas() { const f = [];
    if (!S.foto) f.push("Falta a foto do equipamento.");
    if (pin.value.length !== 6) f.push("Digite a sua senha de 6 números.");
    if (!decl.checked) f.push("Marque a declaração de que você inspecionou pessoalmente.");
    return f; }
  function mostrar(f) { if (!f.length) { erro.hidden = true; return; } erro.replaceChildren("Antes de enviar:", el("ul", {}, f.map(t => el("li", {}, t)))); erro.hidden = false; }
  function revalidar() { if (!erro.hidden) mostrar(faltas()); }
  async function concluir() {
    const f = faltas(); if (f.length) { mostrar(f); erro.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const fx = (CFG.funcionarios || []).find(x => x.matricula === S.matricula) || {};
    const hPin = await sha256(S.matricula + ":" + pin.value);
    if (!MODO_DEMO) {
      if (!fx.h) { mostrar(["Você ainda não tem senha cadastrada. Peça a sua senha provisória ao supervisor."]); return; }
      if (hPin !== fx.h) { mostrar(["Senha não confere. Digite de novo. Se esqueceu a senha, fale com o supervisor."]); pin.value = ""; return; }
    }
    const fim = agoraISO(), itens = CFG.itens.filter(i => i.checklist === c.id), campos = (CFG.campos || []).filter(x => x.checklist === c.id);
    const payload = { id: uid(), versao_app: VERSAO_APP, versao_lista: CFG.versao_lista, contrato: S.contrato, checklist_id: c.id, checklist: c.nome,
      matricula: S.matricula, nome: S.nome, turno: S.turno, inicio_sessao: S.inicioSessao, inicio_checklist: S.inicio, fim,
      plantao: chavePlantao(c, S.matricula, S.turno, S.inicio),
      senha_hash: hPin,
      cabecalho: campos.map(cp => ({ campo_id: cp.id, rotulo: cp.rotulo, valor: S.cab[cp.id] || "" })),
      tem_nao_conforme: itens.some(i => S.resp[i.id].sit === "N") || itens.some(i => i.tipo === "lista" && opcoes(i.texto_se).includes(S.resp[i.id].valor)),
      respostas: itens.map(i => { const r = S.resp[i.id];
        return { item_id: i.id, item: i.nome, bloco: i.bloco, tipo: i.tipo, quantidade: r.qtd ?? "", situacao: r.sit ? SIT[r.sit] : (r.valor || ""), descricao: (r.desc || "").trim(), foto: r.foto || "", foto_em: r.fotoEm || "" }; }),
      foto_final: { tirada_em: S.fotoEm, origem: "camera_do_app", imagem: S.foto } };
    await filaSalvar({ id: payload.id, criado_em: fim, situacao: "aguardando", checklist_id: c.id, matricula: S.matricula, nome: S.nome, turno: S.turno, plantao: payload.plantao, resumo: c.nome + " · " + S.nome, payload });
    await atualizarChip(); enviarFila();
    if (!MODO_DEMO && fx.prov) telaCriarSenha(payload, hPin); else telaEnviado(payload);
  }
  tela(el("button", { class: "voltar", onclick: telaItens }, "‹ Voltar aos itens"),
    el("div", {}, el("h1", {}, "Foto e envio"), el("p", { class: "sub" }, c.nome + " · " + S.nome)),
    el("div", { class: "bloco" }, el("h2", {}, "Foto do equipamento completo"),
      el("p", { class: "info", style: "margin:0" }, "Bata a foto agora, aqui no app. Não dá para usar foto da galeria."),
      el("div", { class: "foto-caixa" }, camera(S.foto, (d, em) => { S.foto = d; S.fotoEm = em; revalidar(); }))),
    el("div", { class: "bloco" }, el("label", { class: "rot", for: "pin" }, "Senha pessoal"), pin,
      el("label", { class: "decl", for: "decl" }, decl, el("span", {}, "Declaro que inspecionei pessoalmente estes equipamentos."))),
    erro, el("button", { class: "btn btn-pri", onclick: concluir }, "Salvar e enviar"));
}

/* Primeiro uso (ou senha provisória nova): o bombeiro cria a senha pessoal de 6 números */
function telaCriarSenha(p, hProv) {
  barra();
  const campo = ph => el("input", { type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "6", placeholder: ph, oninput: e => { e.target.value = e.target.value.replace(/\D/g, ""); } });
  const a = campo("Nova senha (6 números)"), b = campo("Repita a nova senha");
  const erro = el("div", { class: "erro", hidden: true });
  const fraca = s => /^(\d)\1{5}$/.test(s) || "01234567890".includes(s) || "09876543210".includes(s);
  const ok = el("button", { class: "btn btn-pri", onclick: async () => {
    const f = [];
    if (a.value.length !== 6) f.push("A nova senha precisa ter 6 números.");
    else if (fraca(a.value)) f.push("Senha muito fácil (sequência ou números repetidos). Escolha outra.");
    if (a.value !== b.value) f.push("As duas senhas não são iguais.");
    if (f.length) { erro.replaceChildren(el("ul", {}, f.map(t => el("li", {}, t)))); erro.hidden = false; return; }
    if (!navigator.onLine) { erro.textContent = "Sem internet agora. Seu checklist já está salvo. Na próxima vez, com internet, o app pede de novo para criar a senha."; erro.hidden = false; return; }
    ok.disabled = true; ok.textContent = "Gravando…";
    const novo = await sha256(S.matricula + ":" + a.value);
    try { const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ acao: "criar_senha", chave: CHAVE, matricula: S.matricula, hash_atual: hProv, novo_hash: novo }) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) { const fx = CFG.funcionarios.find(x => x.matricula === S.matricula); if (fx) { fx.h = novo; fx.prov = false; } await cfgSalvar("atual", { cfg: CFG, em: cfgEm });
        return telaEnviado(p, "Senha pessoal criada. A partir de agora, use só a sua senha nova."); }
      erro.textContent = "Não foi possível gravar a senha. Tente de novo ou fale com o supervisor.";
    } catch (e) { erro.textContent = "Sem conexão com o servidor. Tente de novo."; }
    erro.hidden = false; ok.disabled = false; ok.textContent = "Criar minha senha"; } }, "Criar minha senha");
  tela(el("div", { class: "sucesso" }, "Checklist salvo."),
    el("div", {}, el("h1", {}, "Crie sua senha pessoal"), el("p", { class: "sub" }, "Você usou a senha provisória. Agora crie a sua senha de 6 números. Ela é a sua assinatura nos checklists: não passe para ninguém.")),
    el("div", { class: "bloco" }, el("label", { class: "rot" }, "Nova senha"), a, el("label", { class: "rot" }, "Repita a nova senha"), b),
    erro, ok, el("button", { class: "btn btn-sec", onclick: () => telaEnviado(p) }, "Agora não"));
}

function telaEnviado(p, aviso) {
  barra();
  const nc = p.respostas.filter(r => r.situacao === "Não conforme");
  tela(aviso ? el("div", { class: "sucesso" }, aviso) : null,
    el("div", { class: "sucesso" }, navigator.onLine || MODO_DEMO ? "Checklist salvo. Enviando agora." : "Checklist salvo no celular. Ele será enviado sozinho quando houver sinal."),
    el("div", { class: "bloco" }, el("h2", {}, p.checklist),
      el("p", { class: "info", style: "margin:0" }, p.respostas.length + " itens conferidos · ", el("strong", {}, nc.length ? nc.length + " não conforme" + (nc.length > 1 ? "s" : "") : "nenhum não conforme")),
      nc.length ? el("div", { class: "aviso" }, "Não conformes: " + nc.map(r => r.item).join(", ") + ". Se for grave, avise o supervisor por telefone também.") : null),
    el("button", { class: "btn btn-pri", onclick: () => { S.ck = null; telaEscolha(); } }, "Fazer outro checklist"),
    el("button", { class: "btn btn-sec", onclick: telaFila }, "Ver fila de envio"));
}

async function telaFila() {
  barra();
  const f = (await filaListar()).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  tela(el("button", { class: "voltar", onclick: () => CFG ? telaInicio() : telaAtivar() }, "‹ Início"),
    el("div", {}, el("h1", {}, "Fila de envio"), el("p", { class: "sub" }, "Checklists salvos neste celular.")),
    el("div", { class: "bloco" }, f.length ? f.slice(0, 40).map(r => el("div", { class: "fila-item" },
      el("span", {}, r.resumo, el("br"), el("span", { class: "info" }, horaLocal(r.criado_em))),
      el("span", { class: "tag " + (r.situacao === "enviado" ? "env" : "esp") }, r.situacao === "enviado" ? "Enviado" : "Aguardando"))) :
      el("p", { class: "info", style: "margin:0" }, "Nenhum checklist salvo ainda.")),
    el("button", { class: "btn btn-pri", onclick: async () => { await enviarFila(); telaFila(); } }, "Enviar agora"));
}

/* ===== Início ===== */
(async function () {
  if ("serviceWorker" in navigator && location.protocol === "https:" && !MODO_DEMO) { try { navigator.serviceWorker.register("sw.js"); } catch (e) {} }
  await abrirDB(); await carregarConfig();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  const instalado = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (!MODO_DEMO && (!instalado || !db)) $("#tela").before(el("div", { class: "alerta-nav" }, !db
    ? "Atenção: este navegador não está guardando os dados (aba anônima ou bloqueio). Os checklists podem se perder. Use o Checklist BG pelo ícone na tela inicial."
    : "Você está usando o Checklist BG pelo navegador. Para não perder checklists nem a ativação, instale na tela inicial (guia de instalação) e use sempre pelo ícone. Não use aba anônima."));
  if (!CFG) { $("#faixa").textContent = "App " + VERSAO_APP; telaAtivar(); }
  else { textoFaixa(); telaInicio(); }
  await atualizarChip(); enviarFila();
})();
