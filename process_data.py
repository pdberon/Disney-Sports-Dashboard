import os
import glob
import re
import pdfplumber
import requests

# Configuración de Airtable
AIRTABLE_TOKEN = os.environ.get("AIRTABLE_TOKEN")
BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
TABLE_NAME = "Metricas_Diarias"

# Expresión regular para detectar filas con UUIDs de programas en el PDF
# Detecta: Fecha, Mercado, Título del Show, UUID (PROGRAMID), Liga y las métricas numéricas asociadas.
ROW_REGEX = re.compile(
    r"(?:\d+\s+)?"                      # Número de fila (opcional)
    r"(\d{4}-\d{2}-\d{2})\s+"           # 1. Fecha (YYYY-MM-DD)
    r"([A-Z]{2,5})\s+"                  # 2. Mercado (LATAM, BR, MX, etc.)
    r"(.*?)\s+"                         # 3. Título del show
    r"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\s+" # 4. UUID / PROGRAMID
    r"(.*?)\s+"                         # 5. Liga
    r"([\d,.]+)\s+"                     # 6. Streaming Accounts (L1 Str. Acc)
    r"([\d,.]+%?)\s+"                   # 7. Reach%
    r"[\d,.]+\s+[\d,.]+\s+[\d,.]+\s+"   # Salta: Total FS, New FS, Reconnected FS
    r"([\d,.]+)\s+"                     # 8. L1 Hours
    r"([\d,.]+%?)\s+"                   # 9. Watch%
    r"[\d,.]+"                          # Salta HPS
)

def clean_number(val):
    """Limpia formatos numéricos con comas o símbolos de porcentaje."""
    if not val:
        return 0
    val = val.replace("%", "").replace(",", "")
    try:
        return float(val) if "." in val else int(val)
    except ValueError:
        return 0

def upload_to_airtable(records):
    url = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_NAME}"
    headers = {
        "Authorization": f"Bearer {AIRTABLE_TOKEN}",
        "Content-Type": "application/json"
    }
    
    for i in range(0, len(records), 10):
        chunk = records[i:i+10]
        payload = {
            "records": [{"fields": record} for record in chunk],
            "typecast": True  # Airtable vinculará el PROGRAMID a la otra tabla automáticamente
        }
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            print(f"Error al subir lote a Airtable: {response.text}")
        else:
            print(f"Se cargaron {len(chunk)} registros de shows correctamente.")

def process_pdf_files():
    # Buscamos todos los PDFs en la carpeta 'raw_data'
    pdf_files = glob.glob('raw_data/*.pdf')
    airtable_records = []
    
    for pdf_path in pdf_files:
        print(f"Procesando archivo PDF: {pdf_path}")
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                text = page.extract_text()
                if not text:
                    continue
                
                # Procesamos línea por línea el texto extraído
                for line in text.split("\n"):
                    match = ROW_REGEX.search(line.strip())
                    if match:
                        date = match.group(1)
                        market = match.group(2)
                        program_id = match.group(4)
                        str_acc = clean_number(match.group(6))
                        reach_pct = clean_number(match.group(7)) / 100.0
                        hours = clean_number(match.group(8))
                        
                        # Armamos el registro para enviar a Airtable
                        record = {
                            "Date": date,
                            "Market": market,
                            "PROGRAMID": [program_id], # Enviado como lista para enlazar en Airtable
                            "Streaming_Accounts": str_acc,
                            "Hours_Streamed": hours,
                            "Reach_Percent": reach_pct
                        }
                        airtable_records.append(record)
                        
    if airtable_records:
        # Opcional: Filtrar duplicados locales antes de subir
        print(f"Total de registros de shows extraídos: {len(airtable_records)}")
        upload_to_airtable(airtable_records)
    else:
        print("No se encontraron registros de shows con IDs válidos en los PDFs.")

if __name__ == "__main__":
    process_pdf_files()
