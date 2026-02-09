function isoParaPonto(dataIso) {
  if (!dataIso) return "";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}.${mes}.${ano}`;
}

function formatarDataHoraAgora() {
  const agora = new Date();
  return agora.toLocaleString("pt-BR");
}

function salvarHistorico(item) {
  let historico = JSON.parse(localStorage.getItem("historico_extratos")) || [];
  historico.unshift(item);
  historico = historico.slice(0, 25);
  localStorage.setItem("historico_extratos", JSON.stringify(historico));
}

function renderHistorico() {
  const historicoEl = document.getElementById("historico");
  const historico = JSON.parse(localStorage.getItem("historico_extratos")) || [];

  historicoEl.innerHTML = "";

  historico.forEach(h => {
    const li = document.createElement("li");
    li.textContent = `${h.tipo.toUpperCase()} | ${h.periodo} | ${h.decendio} | ${h.quando}`;
    historicoEl.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("extratoForm");
  const statusEl = document.getElementById("status");
  const btnGerar = document.getElementById("btnGerar");

  renderHistorico();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    btnGerar.disabled = true;
    statusEl.classList.remove("hidden");

    const tipo = document.getElementById("tipo").value;
    const decendio = document.getElementById("decendio").value;
    const dataInicioIso = document.getElementById("data_inicio").value;
    const dataFimIso = document.getElementById("data_fim").value;

    if (!dataInicioIso || !dataFimIso) {
      alert("Preencha as datas.");
      btnGerar.disabled = false;
      statusEl.classList.add("hidden");
      return;
    }

    const payload = {
      tipo: tipo,
      decendio: decendio,
      data_inicio: isoParaPonto(dataInicioIso),
      data_fim: isoParaPonto(dataFimIso)
    };

    try {
      const res = await fetch("/extratos/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        const err = await res.json();
        alert(err.erro || "Erro ao gerar extratos.");
        return;
      }

      if (!contentType.includes("application/zip")) {
        const err = await res.json();
        alert(err.erro || "Erro ao gerar extratos.");
        return;
      }

      // download ZIP
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "extratos.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // histórico
      salvarHistorico({
        tipo,
        periodo: `${payload.data_inicio} até ${payload.data_fim}`,
        decendio: decendio,
        quando: formatarDataHoraAgora()
      });

      renderHistorico();

    } finally {
      btnGerar.disabled = false;
      statusEl.classList.add("hidden");
    }
  });

});
