import os
import glob
import pandas as pd
import requests

# Configuración desde variables de entorno (por seguridad)
AIRTABLE_TOKEN = os.environ.get("AIRTABLE_TOKEN")
BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
TABLE_NAME = "Metricas_Diarias"

def upload_to_airtable(records):
    url = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_NAME}"
    headers = {
        "Authorization": f"Bearer {AIRTABLE_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # La API de Airtable permite subir hasta 10 registros por petición
    for i in range(0, len(records), 10):
        chunk = records[i:i+10]
        payload = {
            "records": [{"fields": record} for record in chunk],
            "typecast": True  # Permite que Airtable vincule automáticamente los IDs de texto a la otra tabla
        }
        
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            print(f"Error al subir lote: {response.text}")
        else:
            print(f"Lote de {len(chunk)} registros subido correctamente.")

def process_daily_data():
    # Buscamos los archivos descargados hoy en la carpeta temporal 'raw_data'
    all_daily_files = glob.glob('raw_data/*.csv')
    
    airtable_records = []
    
    for file in all_daily_files:
        daily_df = pd.read_csv(file)
        
        for _, row in daily_df.iterrows():
            # Construimos el registro para Airtable
            record = {
                "Date": row.get("Business Date"),
                "Market": row.get("Market"),
                # Pasamos el ID para que Airtable lo enlace automáticamente en la relación
                "PROGRAMID": [row.get("ID (Key Metric for PGM Code)")], 
                "Streaming_Accounts": int(row.get("L1 Str. Acc.", 0)),
                "Hours_Streamed": float(row.get("L1 Hours", 0)),
                "Reach_Percent": float(row.get("L1 Reach%", 0.0))
            }
            # Evitamos registros vacíos sin fecha o programa
            if record["Date"] and record["PROGRAMID"][0]:
                airtable_records.append(record)
                
    if airtable_records:
        upload_to_airtable(airtable_records)
    else:
        print("No se encontraron registros válidos para procesar.")

if __name__ == "__main__":
    process_daily_data()
