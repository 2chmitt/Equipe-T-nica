from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import requests
import urllib3
import re
import os
import json

urllib3.disable_warnings()

app = FastAPI()

# =========================
# CORS
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# PATHS
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
MUNICIPIOS_PATH = os.path.join(BASE_DIR, "municipios.json")

# =========================
# LOAD MUNICIPIOS
# =========================
with open(MUNICIPIOS_PATH, encoding="utf-8") as f:
    MUNICIPIOS = json.load(f)

# =========================
# STATIC FILES
# =========================
app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR),
    name="static"
)

# =========================
# HOME
# =========================
@app.api_route("/", methods=["GET", "HEAD"])
def home():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# =========================
# ENDPOINT AUTOCOMPLETE
# =========================
@app.get("/municipios")
def buscar_municipios(q: str = Query(min_length=2)):
    termo = q.strip().upper()

    resultados_inicio = []
    resultados_contem = []

    for m in MUNICIPIOS:
        nome = m["nomeBeneficiarioSaida"].upper()

        item = {
            "codigo": m["codigoBeneficiarioSaida"],
            "municipio": m["nomeBeneficiarioSaida"],
            "uf": m["siglaUnidadeFederacaoSaida"]
        }

        # Prioridade 1: começa com o termo
        if nome.startswith(termo):
            resultados_inicio.append(item)

        # Prioridade 2: contém o termo
        elif termo in nome:
            resultados_contem.append(item)

    # junta (começa primeiro)
    resultados = resultados_inicio + resultados_contem

    # aumenta limite (recomendado 50)
    return resultados[:50]


# =========================
# CONFIG BB
# =========================
URL_BB = "https://demonstrativos.api.daf.bb.com.br/v1/demonstrativo/daf/consulta"

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://demonstrativos.apps.bb.com.br",
    "Referer": "https://demonstrativos.apps.bb.com.br/"
}

# =========================
# MODELS
# =========================
class Consulta(BaseModel):
    codigo: int
    nome: str
    uf: str
    data_inicio: str
    data_fim: str

# =========================
# FUNÇÕES BB
# =========================
def consultar_bb(codigo, fundo, data_inicio, data_fim):
    payload = {
        "codigoBeneficiario": codigo,
        "codigoFundo": fundo,
        "dataInicio": data_inicio,
        "dataFim": data_fim
    }

    r = requests.post(
        URL_BB,
        headers=HEADERS,
        json=payload,
        verify=False,
        timeout=60
    )

    return r.json() if r.status_code == 200 else {}

def extrair_credito_benef(json_data):
    if not json_data:
        return 0.0

    for item in json_data.get("quantidadeOcorrencia", []):
        nome = item.get("nomeBeneficio", "")
        if "CREDITO BENEF." in nome:
            match = re.search(r'(\d{1,3}(?:\.\d{3})*,\d{2})C', nome)
            if match:
                return float(
                    match.group(1)
                    .replace('.', '')
                    .replace(',', '.')
                )
    return 0.0

# =========================
# CONSULTA
# =========================
@app.post("/consulta")
def consultar(consulta: Consulta):

    CODIGO_FPM = 4
    CODIGO_ROYALTIES = 28
    CODIGO_TODOS = 0

    fpm = extrair_credito_benef(
        consultar_bb(consulta.codigo, CODIGO_FPM, consulta.data_inicio, consulta.data_fim)
    )

    royalties = extrair_credito_benef(
        consultar_bb(consulta.codigo, CODIGO_ROYALTIES, consulta.data_inicio, consulta.data_fim)
    )

    todos = extrair_credito_benef(
        consultar_bb(consulta.codigo, CODIGO_TODOS, consulta.data_inicio, consulta.data_fim)
    )

    return {
        "municipio": f"{consulta.nome} - {consulta.uf}",
        "periodo": f"{consulta.data_inicio} até {consulta.data_fim}",
        "fpm": round(fpm, 2),
        "royalties": round(royalties, 2),
        "todos": round(todos, 2)
    }

from io import BytesIO
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import zipfile
from datetime import datetime

# =========================
# MUNICÍPIOS FIXOS (EXATOS DO SEU CÓDIGO)
# =========================

MUNICIPIOS_ROYALTIES_EXTRATO = [
    {"codigo": 362, "municipio": "ALVARAES", "uf": "AM"},
    {"codigo": 950, "municipio": "BARRA DE SAO MIGUEL", "uf": "AL"},
    {"codigo": 1175, "municipio": "BOCA DA MATA", "uf": "AL"},
    {"codigo": 1639, "municipio": "CAMPO ALEGRE", "uf": "AL"},
    {"codigo": 4636, "municipio": "MANACAPURU", "uf": "AM"},
    {"codigo": 4660, "municipio": "MANICORE", "uf": "AM"},
    {"codigo": 5225, "municipio": "NHAMUNDA", "uf": "AM"},
    {"codigo": 5389, "municipio": "NOVO AIRAO", "uf": "AM"},
    {"codigo": 6957, "municipio": "SANTA ISABEL DO RIO NEGRO", "uf": "AM"},
    {"codigo": 7338, "municipio": "SAO GABRIEL DA CACHOEIRA", "uf": "AM"},
    {"codigo": 7638, "municipio": "SAO PAULO DE OLIVENCA", "uf": "AM"},
]

MUNICIPIOS_FPM_EXTRATO = [
    {"codigo": 481, "municipio": "ANORI", "uf": "AM", "coef": "1,2"},
    {"codigo": 971, "municipio": "BARREIRINHA", "uf": "AM", "coef": "2,0"},
    {"codigo": 1166, "municipio": "BOA VISTA DO RAMOS", "uf": "AM", "coef": "1,4"},
    {"codigo": 3756, "municipio": "ITACOATIARA", "uf": "AM", "coef": "4,0"},
    {"codigo": 4636, "municipio": "MANACAPURU", "uf": "AM", "coef": "4,0"},
    {"codigo": 4660, "municipio": "MANICORE", "uf": "AM", "coef": "2,2"},
    {"codigo": 5225, "municipio": "NHAMUNDA", "uf": "AM", "coef": "1,6"},
    {"codigo": 5715, "municipio": "PARINTINS", "uf": "AM", "coef": "4,0"},
    {"codigo": 6691, "municipio": "RIO PRETO DA EVA", "uf": "AM", "coef": "2,2"},
    {"codigo": 7638, "municipio": "SAO PAULO DE OLIVENCA", "uf": "AM", "coef": "2,2"},
    {"codigo": 8319, "municipio": "TONANTINS", "uf": "AM", "coef": "1,6"},
    {"codigo": 3385, "municipio": "HUMAITA", "uf": "AM", "coef": "3,0"},
    {"codigo": 362, "municipio": "ALVARAES", "uf": "AM", "coef": "1,4"},
    {"codigo": 7338, "municipio": "SAO GABRIEL DA CACHOEIRA", "uf": "AM", "coef": "2,8"},
    {"codigo": 972, "municipio": "BARREIRINHAS", "uf": "MA", "coef": "2,4"},
    {"codigo": 11085, "municipio": "ITAIPAVA DO GRAJAU", "uf": "MA", "coef": "1,0"},
    {"codigo": 8519, "municipio": "URBANO SANTOS", "uf": "MA", "coef": "1,6"},
    {"codigo": 8418, "municipio": "TUNTUM", "uf": "MA", "coef": "1,8"},
    {"codigo": 3495, "municipio": "ICATU", "uf": "MA", "coef": "1,4"},
]

# =========================
# NOVA PÁGINA: /extratos
# =========================
@app.get("/extratos")
def extratos_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "extratos.html"))

# =========================
# LISTA DE MUNICÍPIOS FIXA
# =========================
@app.get("/extratos/municipios")
def extratos_municipios(tipo: str = Query(...)):
    tipo = tipo.lower().strip()

    if tipo == "royalties":
        return MUNICIPIOS_ROYALTIES_EXTRATO

    if tipo == "fpm":
        return MUNICIPIOS_FPM_EXTRATO

    return []

# =========================
# PDF - GERADOR BASE (SEU ESTILO)
# =========================
def gerar_pdf_formatado_com_estilo(json_data, titulo_fundo: str) -> BytesIO:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    margem_esquerda = 20 * mm
    linha_altura = height - 20 * mm

    largura_pagina_util = width - 2 * margem_esquerda
    largura_valor = 35 * mm
    largura_data = 30 * mm

    # Cabeçalho
    c.setFont("Helvetica-Bold", 12)

    beneficiario = "—"
    try:
        beneficiario = json_data["quantidadeOcorrencia"][0]["nomeBeneficio"].strip()
    except Exception:
        beneficiario = "Beneficiário não identificado"

    c.drawString(margem_esquerda, linha_altura, f"Beneficiário: {beneficiario}")
    linha_altura -= 12 * mm

    c.drawString(margem_esquerda, linha_altura, titulo_fundo)
    linha_altura -= 10 * mm

    # Colunas
    c.setFont("Helvetica-Bold", 10)
    c.drawString(margem_esquerda, linha_altura, "DATA")
    c.drawString(margem_esquerda + largura_data, linha_altura, "PARCELA")
    c.drawString(width - margem_esquerda - largura_valor, linha_altura, "VALOR DISTRIBUIDO")
    linha_altura -= 6 * mm
    c.setFont("Helvetica", 10)

    fundo_alternado = [colors.whitesmoke, colors.lightgrey]
    linha_index = 0

    # Linhas (mantém seu padrão de pular os 5 primeiros)
    for item in json_data.get("quantidadeOcorrencia", [])[5:]:
        linha = item.get("nomeBeneficio", "").strip()
        if not linha:
            continue

        bg_color = fundo_alternado[linha_index % 2]
        c.setFillColor(bg_color)
        c.rect(margem_esquerda, linha_altura - 1.5 * mm, largura_pagina_util, 6 * mm, fill=True, stroke=0)
        c.setFillColor(colors.black)

        parts = linha.split()

        if len(parts) >= 3 and parts[-1][-1] in ("C", "D"):
            valor = parts[-1]

            if parts[0].count(".") == 2:
                data = parts[0]
                parcela = " ".join(parts[1:-1])
            else:
                data = ""
                parcela = " ".join(parts[:-1])

            c.drawString(margem_esquerda, linha_altura, data)
            c.drawString(margem_esquerda + largura_data, linha_altura, parcela)
            c.drawRightString(width - margem_esquerda, linha_altura, valor)

        else:
            c.setFont("Helvetica-Bold", 10)
            c.drawString(margem_esquerda, linha_altura, linha)
            c.setFont("Helvetica", 10)

        linha_altura -= 6 * mm
        linha_index += 1

        # quebra simples (se passar do rodapé, cria nova página)
        if linha_altura < 20 * mm:
            c.showPage()
            linha_altura = height - 20 * mm
            c.setFont("Helvetica", 10)

    c.save()
    buffer.seek(0)
    return buffer

# =========================
# POST - GERAR EXTRATO PDF
# =========================
class ExtratoRequest(BaseModel):
    tipo: str          # "fpm" ou "royalties"
    codigo: int
    municipio: str
    uf: str
    coef: str | None = None
    decendio: str
    data_inicio: str
    data_fim: str

class ExtratoLoteRequest(BaseModel):
    tipo: str          # "fpm" ou "royalties"
    decendio: str
    data_inicio: str
    data_fim: str

def mes_ano_extenso_por_data(data_str: str):
    # data_str no formato "dd.mm.yyyy"
    meses_pt = [
        "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
        "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
    ]

    dia, mes, ano = data_str.split(".")
    mes_nome = meses_pt[int(mes) - 1]
    return mes_nome, ano


@app.post("/extratos/gerar")
def gerar_extrato_lote(req: ExtratoLoteRequest):

    tipo = req.tipo.lower().strip()

    if tipo == "fpm":
        codigo_fundo = 4
        titulo_fundo = "FPM - FUNDO DE PARTICIPACAO DOS MUNICIPIOS"
        municipios = MUNICIPIOS_FPM_EXTRATO

    elif tipo == "royalties":
        codigo_fundo = 28
        titulo_fundo = "ANP   - ROYALTIES DA ANP"
        municipios = MUNICIPIOS_ROYALTIES_EXTRATO

    else:
        return {"erro": "Tipo inválido"}

    # 🔥 pega o mês/ano do período (igual sua foto)
    mes_nome, ano_nome = mes_ano_extenso_por_data(req.data_inicio)

    # ZIP em memória
    zip_buffer = BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:

        for m in municipios:

            codigo = m["codigo"]
            municipio = m["municipio"]
            uf = m["uf"]
            coef = m.get("coef")

            data_bb = consultar_bb(codigo, codigo_fundo, req.data_inicio, req.data_fim)

            # Se não tiver dados, pula
            if not data_bb or not data_bb.get("quantidadeOcorrencia"):
                continue

            pdf_buffer = gerar_pdf_formatado_com_estilo(data_bb, titulo_fundo)

            # =========================
            # 🔥 NOME DO ARQUIVO (CORRETO)
            # =========================
            if tipo == "fpm":
                # ex: 2° Decêndio de JANEIRO DE 2026 - ALVARAES (AM) (1,4 Coef.).pdf
                if coef:
                    nome_pdf = f"{req.decendio} Decêndio de {mes_nome} DE {ano_nome} - {municipio} ({uf}) ({coef} Coef.).pdf"
                else:
                    nome_pdf = f"{req.decendio} Decêndio de {mes_nome} DE {ano_nome} - {municipio} ({uf}).pdf"

            else:
                # royalties não tem coef
                nome_pdf = f"{req.decendio} Decêndio de {mes_nome} DE {ano_nome} - {municipio} ({uf}).pdf"

            nome_pdf = nome_pdf.replace("/", "-")

            # escreve PDF dentro do ZIP
            zipf.writestr(nome_pdf, pdf_buffer.getvalue())

    zip_buffer.seek(0)

    # nome do ZIP
    agora = datetime.now().strftime("%Y-%m-%d_%H-%M")
    nome_zip = f"EXTRATOS_{tipo.upper()}_{mes_nome}_{ano_nome}_{req.decendio}_{agora}.zip"
    nome_zip = nome_zip.replace("/", "-").replace(" ", "_")

    headers = {
        "Content-Disposition": f'attachment; filename="{nome_zip}"'
    }

    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)

import calendar
import zipfile
from datetime import datetime
from io import BytesIO
from fastapi.responses import StreamingResponse

# =========================
# NOVA PÁGINA: /extratos-12m
# =========================
@app.get("/extratos-12m")
def extratos_12m_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "extratos_12m.html"))

# =========================
# GERA LISTA DE MESES ENTRE YYYY-MM e YYYY-MM
# =========================
def gerar_datas_por_mes(mes_inicio: str, mes_fim: str):
    # mes_inicio e mes_fim no formato "YYYY-MM"
    meses_pt = [
        "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
        "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
    ]

    ano_i, mes_i = mes_inicio.split("-")
    ano_f, mes_f = mes_fim.split("-")

    ano_i = int(ano_i)
    mes_i = int(mes_i)
    ano_f = int(ano_f)
    mes_f = int(mes_f)

    datas = []

    ano_atual = ano_i
    mes_atual = mes_i

    while (ano_atual < ano_f) or (ano_atual == ano_f and mes_atual <= mes_f):

        inicio_mes = datetime(ano_atual, mes_atual, 1)
        _, ultimo_dia = calendar.monthrange(ano_atual, mes_atual)
        fim_mes = datetime(ano_atual, mes_atual, ultimo_dia)

        data_inicio = inicio_mes.strftime("%d.%m.%Y")
        data_fim = fim_mes.strftime("%d.%m.%Y")

        nome_mes = meses_pt[mes_atual - 1]
        label = f"{nome_mes} DE {ano_atual}"

        datas.append((label, data_inicio, data_fim))

        # avança 1 mês
        if mes_atual == 12:
            mes_atual = 1
            ano_atual += 1
        else:
            mes_atual += 1

    return datas

# =========================
# REQUEST 12M
# =========================
class Extrato12mRequest(BaseModel):
    tipo: str          # "fpm" ou "royalties"
    decendio: str      # "1°", "2°", "3°"

    mes_inicio: str    # "2024-09"
    mes_fim: str       # "2025-08"

    codigo: int
    municipio: str
    uf: str

# =========================
# GERAR 12 MESES (ZIP)
# =========================
@app.post("/extratos-12m/gerar")
def gerar_extrato_12m(req: Extrato12mRequest):

    tipo = req.tipo.lower().strip()

    if tipo == "fpm":
        codigo_fundo = 4
        titulo_fundo = "FPM - FUNDO DE PARTICIPACAO DOS MUNICIPIOS"
    elif tipo == "royalties":
        codigo_fundo = 28
        titulo_fundo = "ANP   - ROYALTIES DA ANP"
    else:
        return {"erro": "Tipo inválido"}

    datas = gerar_datas_por_mes(req.mes_inicio, req.mes_fim)

    # regra: precisa ser exatamente 12 meses
    if len(datas) != 12:
        return {"erro": f"O período deve ter exatamente 12 meses. Você selecionou {len(datas)} mês(es)."}

    zip_buffer = BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:

        for label, data_inicio, data_fim in datas:

            data_bb = consultar_bb(req.codigo, codigo_fundo, data_inicio, data_fim)

            # se não tiver dados, pula
            if not data_bb or not data_bb.get("quantidadeOcorrencia"):
                continue

            pdf_buffer = gerar_pdf_formatado_com_estilo(data_bb, titulo_fundo)

            nome_pdf = f"{req.decendio} Decêndio de {label} - {req.municipio} ({req.uf}).pdf"
            nome_pdf = nome_pdf.replace("/", "-")

            zipf.writestr(nome_pdf, pdf_buffer.getvalue())

    zip_buffer.seek(0)

    agora = datetime.now().strftime("%Y-%m-%d_%H-%M")
    nome_zip = f"EXTRATO_12M_{tipo.upper()}_{req.municipio}_{req.mes_inicio}_ATE_{req.mes_fim}_{agora}.zip"
    nome_zip = nome_zip.replace("/", "-").replace(" ", "_")

    headers = {
        "Content-Disposition": f'attachment; filename="{nome_zip}"'
    }

    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)
