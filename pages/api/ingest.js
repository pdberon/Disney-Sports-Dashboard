import formidable from 'formidable';
import fs from 'fs';
import pdf from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Limpia formatos numéricos con comas, puntos o porcentajes
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

    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    const pdfData = await pdf(fileBuffer);
    const text = pdfData.text;

    const lines = text.split('\n');
    const airtableRecords = [];

    // Patrón básico para identificar líneas de datos que comiencen con Fecha y Mercado
    const DATE_MARKET_REGEX = /(\d{4}-\d{2}-\d{2})\s+([A-Z]{2,5})\s+(.+)/i;

    for (const line of lines) {
      const trimmed = line.trim();
      const dateMarketMatch = trimmed.match(DATE_MARKET_REGEX);
      
      if (dateMarketMatch) {
        const date = dateMarketMatch[1];
        const market = dateMarketMatch[2];
        const restOfLine = dateMarketMatch[3].trim();

        // Extraer todos los valores numéricos del final de la línea
        const tokens = restOfLine.match(/[\d,.]+%?/g);
        if (!tokens || tokens.length < 3) continue;

        // Reconstruir la sección de texto del medio (Show / Partido)
        const firstNumericToken = tokens[0];
        const numericIndex = restOfLine.indexOf(firstNumericToken);
        if (numericIndex === -1) continue;

        const middleString = restOfLine.substring(0, numericIndex).trim();

        // Intentar buscar un UUID de programa
        const uuidMatch = middleString.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        
        let programId = "";
        let title = "";

        if (uuidMatch) {
          programId = uuidMatch[1];
          const parts = middleString.split(uuidMatch[0]);
          title = parts[0].trim();
        } else {
          // Si no tiene UUID (Reportes de la Copa del Mundo), usamos el nombre del partido como ID relacional
          title = middleString;
          if (title.endsWith("FIFA World Cup")) {
            title = title.replace("FIFA World Cup", "").trim();
          }
          // Limpiar sufijos comunes de narración de partidos
          title = title.replace(/\s*\|\s*Closs.*/gi, '')
                       .replace(/\s*\|\s*Relato.*/gi, '')
                       .trim();
          
          programId = title; 
        }

        // Asignar métricas de forma dinámica según la cantidad de números detectados al final
        let strAcc = 0;
        let reachPct = 0;
        let hours = 0;

        if (tokens.length >= 8) {
          // Formato del PDF 1 (Sports Daily Metrics)
          strAcc = cleanNumber(tokens[tokens.length - 8]);
          reachPct = cleanNumber(tokens[tokens.length - 7]) / 100.0;
          hours = cleanNumber(tokens[tokens.length - 3]);
        } else {
          // Formato del PDF 2 (Copa del Mundo - Partidos)
          strAcc = cleanNumber(tokens[tokens.length - 3]);
          reachPct = cleanNumber(tokens[tokens.length - 2]) / 100.0;
          hours = 0; // Este reporte de partidos no contiene horas visualizadas individuales
        }

        if (programId && date) {
          airtableRecords.push({
            fields: {
              "Date": date,
              "Market": market,
              "PROGRAMID": [programId],
              "Streaming_Accounts": strAcc,
              "Hours_Streamed": hours,
              "Reach_Percent": reachPct
            }
          });
        }
      }
    }

    if (airtableRecords.length === 0) {
      return res.status(400).json({ error: "No se encontraron filas estructuradas de shows dentro del PDF." });
    }

    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableToken = process.env.AIRTABLE_TOKEN;
    const tableName = "Metricas_Diarias";

    // Enviar en lotes de 10
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
          typecast: true // Crea automáticamente los nuevos partidos en la tabla Metadatos_Programas
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Airtable Error: ${errText}`);
        return res.status(500).json({ error: "Error al escribir en Airtable.", details: errText });
      }
    }

    return res.status(200).json({ status: "success", count: airtableRecords.length });

  } catch (error) {
    console.error("Internal Server Error:", error);
    return res.status(500).json({ error: "Error interno durante la lectura del PDF.", details: error.message });
  }
}
