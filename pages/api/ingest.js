import formidable from 'formidable';
import fs from 'fs';
import pdf from 'pdf-parse';

// Desactivamos el bodyParser automático de Next.js para permitir que formidable controle el flujo del archivo
export const config = {
  api: {
    bodyParser: false,
  },
};

const ROW_REGEX = /(?:\d+\s+)?(\d{4}-\d{2}-\d{2})\s+([A-Z]{2,5})\s+(.*?)\s+([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\s+(.*?)\s+([\d,.]+)\s+([\d,.]+%?)\s+(?:[\d,.]+\s+){3}([\d,.]+)\s+([\d,.]+%?)\s+([\d,.]+)/i;

function cleanNumber(val) {
  if (!val) return 0;
  const cleaned = val.replace(/%/g, '').replace(/,/g, '').trim();
  return cleaned.includes('.') ? parseFloat(cleaned) : parseInt(cleaned, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  }

  try {
    const form = formidable({ multiples: false });
    
    // Parsear el archivo del formulario
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    // Validar el archivo subido
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: "No se seleccionó ningún archivo." });
    }

    // Leer el archivo en memoria y extraer el texto
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    const pdfData = await pdf(fileBuffer);
    const text = pdfData.text;

    // Procesar texto línea por línea
    const lines = text.split('\n');
    const airtableRecords = [];

    for (const line of lines) {
      const match = line.trim().match(ROW_REGEX);
      if (match) {
        const date = match[1];
        const market = match[2];
        const programId = match[4];
        const strAcc = cleanNumber(match[6]);
        const reachPct = cleanNumber(match[7]) / 100.0;
        const hours = cleanNumber(match[8]);

        airtableRecords.push({
          fields: {
            "Date": date,
            "Market": market,
            "PROGRAMID": [programId], // Enlace relacional en Airtable (debe ir como array)
            "Streaming_Accounts": strAcc,
            "Hours_Streamed": hours,
            "Reach_Percent": reachPct
          }
        });
      }
    }

    if (airtableRecords.length === 0) {
      return res.status(400).json({ error: "No se encontraron filas de shows válidas en el PDF." });
    }

    // Configuración de Airtable desde variables de entorno
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableToken = process.env.AIRTABLE_TOKEN;
    const tableName = "Metricas_Diarias";

    // Enviar a Airtable en lotes de máximo 10 registros
    for (let i = 0; i < airtableRecords.length; i += 10) {
      const chunk = airtableRecords.slice(i, i + 10);
      const url = `https://api.airtable.com/v0/${airtableBaseId}/${tableName}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: chunk,
          typecast: true // Permite que Airtable resuelva los IDs de texto vinculándolos
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Error en Airtable: ${errText}`);
        return res.status(500).json({ error: "Fallo al escribir en Airtable.", details: errText });
      }
    }

    return res.status(200).json({ status: "success", count: airtableRecords.length });

  } catch (error) {
    console.error("Error del servidor:", error);
    return res.status(500).json({ error: "Error interno al procesar el archivo.", details: error.message });
  }
}
