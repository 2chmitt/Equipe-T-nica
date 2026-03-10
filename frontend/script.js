const API_URL = "/consulta";

/* ===== Utils ===== */

function isoParaPonto(dataIso) {
  if (!dataIso) return "";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}.${mes}.${ano}`;
}

function formatarReal(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(valor);
}

function formatarRaw(valor) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(valor);
}

function copiarTexto(texto, botao) {
  navigator.clipboard.writeText(texto).then(() => {
    botao.classList.add("copiado");
    setTimeout(() => botao.classList.remove("copiado"), 1200);
  });
}

function normalizarMunicipio(municipio) {
  const partes = municipio.replace(" - ", " / ").split(" / ");
  return `${partes[0]} / ${partes[1]}`;
}

/* ===== DOM READY ===== */

document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("consultaForm");

  const municipioInput = document.getElementById("municipioInput");
  const sugestoesEl = document.getElementById("sugestoes");
  const codigoHidden = document.getElementById("codigoMunicipio");
  const ufHidden = document.getElementById("ufMunicipio");

  const resMunicipio = document.getElementById("res-municipio");
  const resPeriodo = document.getElementById("res-periodo");

  const valorFpm = document.getElementById("valor-fpm");
  const valorRoyalties = document.getElementById("valor-royalties");
  const valorTodos = document.getElementById("valor-todos");

  const statusEl = document.getElementById("status");
  const btnConsultar = document.getElementById("btnConsultar");

  const historicoEl = document.getElementById("historico");

  let historico = JSON.parse(localStorage.getItem("historico")) || [];
  let cacheValores = {};

  /* ===== NOVO CONTROLE DE NAVEGAÇÃO ===== */

  let indiceSelecionado = -1;

  function atualizarSelecao(itens) {

    itens.forEach(el => el.classList.remove("ativo"));

    if (indiceSelecionado >= 0 && itens[indiceSelecionado]) {
      itens[indiceSelecionado].classList.add("ativo");
      itens[indiceSelecionado].scrollIntoView({ block: "nearest" });
    }

  }

  renderHistorico();

  /* ===== HISTÓRICO ===== */

  function salvarNoHistorico(data) {
    historico.unshift(data);
    historico = historico.slice(0, 25);
    localStorage.setItem("historico", JSON.stringify(historico));
    renderHistorico();
  }

  function renderHistorico() {
    historicoEl.innerHTML = "";
    historico.forEach(item => {
      const li = document.createElement("li");
      li.textContent = `${normalizarMunicipio(item.municipio)} | ${item.periodo}`;
      li.addEventListener("click", () => renderResultado(item));
      historicoEl.appendChild(li);
    });
  }

  /* ===== AUTOCOMPLETE ===== */

  let timeout = null;

  municipioInput.addEventListener("input", () => {

    indiceSelecionado = -1;

    clearTimeout(timeout);
    codigoHidden.value = "";
    ufHidden.value = "";

    const termo = municipioInput.value.trim();
    if (termo.length < 2) {
      fecharSugestoes();
      return;
    }

    timeout = setTimeout(async () => {

      const res = await fetch(`/municipios?q=${encodeURIComponent(termo)}`);
      const dados = await res.json();

      sugestoesEl.innerHTML = "";

      if (!dados || dados.length === 0) {
        fecharSugestoes();
        return;
      }

      dados.forEach(m => {

        const li = document.createElement("li");
        li.textContent = `${m.municipio} (${m.uf})`;

        li.addEventListener("click", () => {
          municipioInput.value = `${m.municipio} / ${m.uf}`;
          codigoHidden.value = m.codigo;
          ufHidden.value = m.uf;
          fecharSugestoes();
        });

        sugestoesEl.appendChild(li);

      });

      sugestoesEl.style.display = "block";

    }, 250);

  });

  /* ===== NAVEGAÇÃO POR TECLADO ===== */

  municipioInput.addEventListener("keydown", (e) => {

    const itens = sugestoesEl.querySelectorAll("li");

    if (!itens.length) return;

    if (e.key === "ArrowDown") {

      e.preventDefault();

      indiceSelecionado++;

      if (indiceSelecionado >= itens.length) {
        indiceSelecionado = 0;
      }

      atualizarSelecao(itens);

    }

    else if (e.key === "ArrowUp") {

      e.preventDefault();

      indiceSelecionado--;

      if (indiceSelecionado < 0) {
        indiceSelecionado = itens.length - 1;
      }

      atualizarSelecao(itens);

    }

    else if (e.key === "Enter") {

      e.preventDefault();

      if (indiceSelecionado >= 0) {
        itens[indiceSelecionado].click();
      }

    }

  });

  function fecharSugestoes() {
    sugestoesEl.innerHTML = "";
    sugestoesEl.style.display = "none";
  }

  document.addEventListener("click", e => {
    if (!e.target.closest(".autocomplete")) fecharSugestoes();
  });

  /* ===== BOTÕES COPIAR ===== */

  document.querySelectorAll(".btn-copy").forEach(btn => {

    btn.addEventListener("click", () => {

      const tipo = btn.dataset.copy;

      if (tipo === "fpm-raw") copiarTexto(formatarRaw(cacheValores.fpm), btn);
      if (tipo === "fpm-brl") copiarTexto(formatarReal(cacheValores.fpm), btn);

      if (tipo === "royalties-raw") copiarTexto(formatarRaw(cacheValores.royalties), btn);
      if (tipo === "royalties-brl") copiarTexto(formatarReal(cacheValores.royalties), btn);

      if (tipo === "todos-raw") copiarTexto(formatarRaw(cacheValores.todos), btn);
      if (tipo === "todos-brl") copiarTexto(formatarReal(cacheValores.todos), btn);

    });

  });

  /* ===== SUBMIT ===== */

  form.addEventListener("submit", async e => {

    e.preventDefault();

    if (!codigoHidden.value) {
      alert("Selecione um município");
      return;
    }

    statusEl.classList.remove("hidden");
    btnConsultar.disabled = true;

    resMunicipio.innerText = "Consultando…";
    resPeriodo.innerText = "";

    valorFpm.innerText = "—";
    valorRoyalties.innerText = "—";
    valorTodos.innerText = "—";

    const payload = {
      codigo: Number(codigoHidden.value),
      nome: municipioInput.value,
      uf: ufHidden.value,
      data_inicio: isoParaPonto(document.getElementById("data_inicio").value),
      data_fim: isoParaPonto(document.getElementById("data_fim").value)
    };

    try {

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      renderResultado(data);
      salvarNoHistorico(data);

    }

    finally {

      statusEl.classList.add("hidden");
      btnConsultar.disabled = false;

    }

  });

  /* ===== RENDER RESULTADO ===== */

  function renderResultado(data) {

    cacheValores = {
      fpm: data.fpm,
      royalties: data.royalties,
      todos: data.todos
    };

    resMunicipio.innerText = normalizarMunicipio(data.municipio);
    resPeriodo.innerText = data.periodo;

    valorFpm.innerText = formatarReal(data.fpm);
    valorRoyalties.innerText = formatarReal(data.royalties);
    valorTodos.innerText = formatarReal(data.todos);

  }

});
