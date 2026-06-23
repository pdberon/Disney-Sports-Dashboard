import formidable from 'formidable';
import fs from 'fs';
import pdf from 'pdf-parse';

// Desactivamos el parser interno de Next.js para permitir que formidable procese el multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

// Regex para mapear filas del PDF de Looker que contienen UUIDs de shows de deportes
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
    
    // Parsear el archivo temporal cargado
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: "No se seleccionó ningún archivo." });
    }

    // Cargar buffer del archivo y extraer el texto del PDF
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
            "PROGRAMID": [programId], // Enlaza directamente usando la relación de Airtable
            "Streaming_Accounts": strAcc,
            "Hours_Streamed": hours,
            "Reach_Percent": reachPct
          }
        });
      }
    }

    if (airtableRecords.length === 0) {
      return res.status(400).json({ error: "No se encontraron filas estructuradas de shows dentro del PDF." });
    }

    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableToken = process.env.AIRTABLE_TOKEN;
    const tableName = "Metricas_Diarias";

    // Subir registros a Airtable en lotes de 10
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
          typecast: true // Vincula automáticamente el ID con la tabla "Metadatos_Programas"
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Airtable Error: ${errText}`);
        return res.status(500).json({ error: "Error al escribir datos en Airtable.", details: errText });
      }
    }

    return res.status(200).json({ status: "success", count: airtableRecords.length });

  } catch (error) {
    console.error("Internal Server Error:", error);
    return res.status(500).json({ error: "Error interno durante la lectura del PDF.", details: error.message });
  }
}
