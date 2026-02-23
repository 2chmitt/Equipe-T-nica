function formatarDataHoraAgora() {
  const agora = new Date();
  return agora.toLocaleString("pt-BR");
}

function fecharSugestoes(sugestoesEl) {
  sugestoesEl.innerHTML = "";
  sugestoesEl.style.display = "none";
}

/* ===== HISTÓRICO ===== */

function salvarHistorico(item) {
  let historico = JSON.parse(localStorage.getItem("historico_extratos_12m")) || [];
  historico.unshift(item);
  historico = historico.slice(0, 25);
  localStorage.setItem("historico_extratos_12m", JSON.stringify(historico));
}

function renderHistorico() {
  const historicoEl = document.getElementById("historico");
  const historico = JSON.parse(localStorage.getItem("historico_extratos_12m")) || [];

  historicoEl.innerHTML = "";

  historico.forEach(h => {
    const li = document.createElement("li");
    li.textContent = `${h.tipo.toUpperCase()} | ${h.municipio} (${h.uf}) | ${h.periodo} | ${h.quando}`;
    historicoEl.appendChild(li);
  });
}

/* ===== AUTOCOMPLETE (igual seu site) ===== */

let timeout = null;

document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("form12m");

  const municipioInput = document.getElementById("municipioInput");
  const sugestoesEl = document.getElementById("sugestoes");
  const codigoHidden = document.getElementById("codigoMunicipio");
  const ufHidden = document.getElementById("ufMunicipio");

  const statusEl = document.getElementById("status");
  const btnGerar = document.getElementById("btnGerar");

  renderHistorico();

  municipioInput.addEventListener("input", () => {
    clearTimeout(timeout);

    codigoHidden.value = "";
    ufHidden.value = "";

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

  document.addEventListener("click", e => {
    if (!e.target.closest(".autocomplete")) fecharSugestoes(sugestoesEl);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!codigoHidden.value) {
      alert("Selecione um município da lista.");
      return;
    }

    const mesInicio = document.getElementById("mes_inicio").value; // yyyy-mm
    const mesFim = document.getElementById("mes_fim").value;       // yyyy-mm

    if (!mesInicio || !mesFim) {
      alert("Selecione o mês inicial e o mês final.");
      return;
    }

    btnGerar.disabled = true;
    statusEl.classList.remove("hidden");

    const tipo = document.getElementById("tipo").value;

    const payload = {
      tipo,
      mes_inicio: mesInicio,
      mes_fim: mesFim,
      codigo: Number(codigoHidden.value),
      municipio: municipioInput.value.split(" / ")[0],
      uf: ufHidden.value
    };

    try {
      const res = await fetch("/extratos-12m/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        const err = await res.json();
        alert(err.erro || "Erro ao gerar extrato 12 meses.");
        return;
      }

      if (!contentType.includes("application/zip")) {
        const err = await res.json();
        alert(err.erro || "Erro ao gerar extrato 12 meses.");
        return;
      }

      // download ZIP
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        // 🔥 pega nome do header enviado pelo backend
        const contentDisposition = res.headers.get("content-disposition");

        let nomeArquivo = "extrato.zip"; // fallback

        if (contentDisposition && contentDisposition.includes("filename=")) {
          const match = contentDisposition.match(/filename="(.+)"/);
          if (match && match[1]) {
            nomeArquivo = match[1];
          }
        }

        const a = document.createElement("a");
        a.href = url;
        a.download = nomeArquivo;   // ✅ agora usa o nome do backend
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

      // histórico
      salvarHistorico({
        tipo,
        municipio: payload.municipio,
        uf: payload.uf,
        periodo: `${mesInicio} até ${mesFim}`,
        quando: formatarDataHoraAgora()
      });

      renderHistorico();

    } finally {
      btnGerar.disabled = false;
      statusEl.classList.add("hidden");
    }
  });

});
