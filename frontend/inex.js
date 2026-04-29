function fecharSugestoes(sugestoesEl) {
  sugestoesEl.innerHTML = "";
  sugestoesEl.style.display = "none";
}

function formatarBRL(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getFilenameFromDisposition(res) {
  const cd = res.headers.get("content-disposition") || "";
  const match = cd.match(/filename="(.+)"/);
  return match && match[1] ? match[1] : null;
}

let timeout = null;
let lastPayload = null;
let indiceSelecionado = -1;

function atualizarSelecao(itens) {
  itens.forEach(el => el.classList.remove("ativo"));

  if (indiceSelecionado >= 0 && itens[indiceSelecionado]) {
    itens[indiceSelecionado].classList.add("ativo");
    itens[indiceSelecionado].scrollIntoView({ block: "nearest" });
  }
}

document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("formInex");

  const municipioInput = document.getElementById("municipioInput");
  const sugestoesEl = document.getElementById("sugestoes");
  const codigoHidden = document.getElementById("codigoMunicipio");
  const ufHidden = document.getElementById("ufMunicipio");

  const statusEl = document.getElementById("status");
  const btnGerar = document.getElementById("btnGerar");
  const btnBaixar = document.getElementById("btnBaixar");
  const btnBaixarZip = document.getElementById("btnBaixarZip");

  const resMunicipio = document.getElementById("res-municipio");
  const resTipo = document.getElementById("res-tipo");
  const resPeriodo = document.getElementById("res-periodo");
  const tbody = document.getElementById("inex-tbody");

  function resetDownloads() {
    lastPayload = null;
    btnBaixar.disabled = true;
    btnBaixarZip.disabled = true;
  }

  municipioInput.addEventListener("input", () => {

    indiceSelecionado = -1;

    clearTimeout(timeout);

    codigoHidden.value = "";
    ufHidden.value = "";
    resetDownloads();

    const termo = municipioInput.value.trim();

    if (termo.length < 2) {
      fecharSugestoes(sugestoesEl);
      return;
    }

    timeout = setTimeout(async () => {

      const res = await fetch(`/municipios?q=${encodeURIComponent(termo)}`);
      const dados = await res.json();

      sugestoesEl.innerHTML = "";

      if (!dados || dados.length === 0) {
        fecharSugestoes(sugestoesEl);
        return;
      }

      dados.forEach(m => {

        const li = document.createElement("li");
        li.textContent = `${m.municipio} (${m.uf})`;

        li.addEventListener("click", () => {
          municipioInput.value = `${m.municipio} / ${m.uf}`;
          codigoHidden.value = m.codigo;
          ufHidden.value = m.uf;
          fecharSugestoes(sugestoesEl);
        });

        sugestoesEl.appendChild(li);

      });

      sugestoesEl.style.display = "block";

    }, 250);

  });

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

  document.addEventListener("click", e => {
    if (!e.target.closest(".autocomplete")) fecharSugestoes(sugestoesEl);
  });

  function renderTabela(resultados) {
    tbody.innerHTML = "";

    if (!resultados || resultados.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" class="muted">Sem dados.</td>`;
      tbody.appendChild(tr);
      return;
    }

    resultados.forEach(item => {
      const tr = document.createElement("tr");

      const tdMes = document.createElement("td");
      tdMes.textContent = item.mes;

      const tdValor = document.createElement("td");
      tdValor.textContent = formatarBRL(item.valor);

      const tdCopy = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-copy";
      btn.textContent = "📋";

      btn.addEventListener("click", async () => {
        await navigator.clipboard.writeText(
  Number(item.valor).toFixed(2).replace(".", ","));
        btn.classList.add("copiado");
        setTimeout(() => btn.classList.remove("copiado"), 800);
      });

      tdCopy.appendChild(btn);

      tr.appendChild(tdMes);
      tr.appendChild(tdValor);
      tr.appendChild(tdCopy);

      tbody.appendChild(tr);
    });
  }

  function montarPayload() {
    return {
      tipo: document.getElementById("tipo").value,
      mes_inicio: document.getElementById("mes_inicio").value,
      mes_fim: document.getElementById("mes_fim").value,
      codigo: Number(codigoHidden.value),
      municipio: municipioInput.value.split(" / ")[0],
      uf: ufHidden.value
    };
  }

  async function baixarArquivo(endpoint, payload, fallbackName, expectedContentType) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      const err = await res.json();
      alert(err.erro || "Erro ao baixar arquivo.");
      return;
    }

    if (!contentType.includes(expectedContentType)) {
      const err = await res.json();
      alert(err.erro || "Resposta inesperada do servidor.");
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = getFilenameFromDisposition(res) || fallbackName;

    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  }

  form.addEventListener("submit", async (e) => {

    e.preventDefault();

    if (!codigoHidden.value) {
      alert("Selecione um município da lista.");
      return;
    }

    const mesInicio = document.getElementById("mes_inicio").value;
    const mesFim = document.getElementById("mes_fim").value;

    if (!mesInicio || !mesFim) {
      alert("Selecione mês inicial e mês final.");
      return;
    }

    btnGerar.disabled = true;
    statusEl.classList.remove("hidden");
    resetDownloads();

    const payload = montarPayload();

    try {

      const res = await fetch("/inex/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || data.erro) {
        alert(data.erro || "Erro ao gerar INEX.");
        return;
      }

      lastPayload = payload;
      btnBaixar.disabled = false;
      btnBaixarZip.disabled = false;

      resMunicipio.textContent = data.municipio || "—";
      resTipo.textContent = data.tipo || "—";
      resPeriodo.textContent = data.periodo || "—";

      renderTabela(data.resultados);

    }

    finally {

      btnGerar.disabled = false;
      statusEl.classList.add("hidden");

    }

  });

  btnBaixar.addEventListener("click", async () => {

    if (!lastPayload) return;

    btnBaixar.disabled = true;
    statusEl.classList.remove("hidden");

    try {

      await baixarArquivo(
        "/inex/baixar",
        lastPayload,
        "INEX.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

    }

    finally {

      statusEl.classList.add("hidden");
      btnBaixar.disabled = false;

    }

  });

  btnBaixarZip.addEventListener("click", async () => {

    if (!lastPayload) return;

    btnBaixarZip.disabled = true;
    statusEl.classList.remove("hidden");

    try {

      await baixarArquivo(
        "/inex/baixar-zip",
        lastPayload,
        "Extratos.zip",
        "application/zip"
      );

    }

    finally {

      statusEl.classList.add("hidden");
      btnBaixarZip.disabled = false;

    }

  });

});
