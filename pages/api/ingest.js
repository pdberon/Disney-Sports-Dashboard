import formidable from 'formidable';
import fs from 'fs';
import pdf from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false,
  },
};

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
    
    // Normalizar espacios en blanco invisibles (como \u00A0 de Looker)
    let rawText = pdfData.text || "";
    let text = rawText.replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ');
    text = text.replace(/[ \t]+/g, ' '); // reducir espacios múltiples a uno normal

    const lines = text.split(/\r?\n/);
    const airtableRecords = [];

    // Buscador súper flexible de países/mercados en las filas de datos
    const COUNTRY_REGEX = /\b(LATAM|CENAM|AR|BR|CL|CO|MX|EC|PE|UY|VE)\b/i;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 1. Validar que la línea tenga una fecha en formato YYYY-MM-DD o DD-MM-YYYY
      const dateMatch = trimmed.match(/(\d{4}[/-]\d{2}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/);
      if (!dateMatch) continue;
      const date = dateMatch[1];

      // 2. Validar que la línea contenga un código de mercado válido
      const countryMatch = trimmed.match(COUNTRY_REGEX);
      if (!countryMatch) continue;
      const market = countryMatch[1].toUpperCase();

      // 3. Limpiar la línea quitando la fecha y el código de país para procesar el resto
      let lineWithoutDate = trimmed.replace(date, '').trim();
      const countryRegex = new RegExp(`\\b${market}\\b`, 'i');
      let cleanLine = lineWithoutDate.replace(countryRegex, '').trim();

      // 4. Extraer todos los números al final de la línea
      const tokens = cleanLine.match(/[\d,.]+%?/g);
      // Una línea de datos real debe tener al menos 3 números (por ej. Streaming Accounts, Reach% y FS/Hours)
      if (!tokens || tokens.length < 3) continue;

      // 5. Determinar el inicio de las métricas numéricas para aislar el nombre del programa/partido
      // Para métricas diarias (tokens.length >= 8) o Copa del Mundo (tokens.length < 8)
      let firstMetricToken = tokens[tokens.length >= 8 ? tokens.length - 8 : tokens.length - 3];
      const metricIndex = cleanLine.indexOf(firstMetricToken);
      if (metricIndex === -1) continue;

      let middleString = cleanLine.substring(0, metricIndex).trim();
      
      // Limpiar índice numérico residual al inicio (ej. "1 ")
      middleString = middleString.replace(/^\d+\s+/, '').trim();

      // 6. Extraer UUID si existe (PDF 1) o usar el nombre del partido como ID (PDF 2)
      const uuidMatch = middleString.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      
      let programId = "";
      let title = "";

      if (uuidMatch) {
        programId = uuidMatch[1];
        const parts = middleString.split(uuidMatch[0]);
        title = parts[0].trim();
      } else {
        title = middleString;
        if (title.endsWith("FIFA World Cup")) {
          title = title.replace("FIFA World Cup", "").trim();
        }
        // Limpiamos leyendas de narración para el Mundial
        title = title.replace(/\s*\|\s*Closs.*/gi, '')
                     .replace(/\s*\|\s*Relato.*/gi, '')
                     .trim();
        
        programId = title; 
      }

      // 7. Mapear métricas
      let strAcc = 0;
      let reachPct = 0;
      let hours = 0;

      if (tokens.length >= 8) {
        // PDF 1 (Sports Daily Metrics)
        strAcc = cleanNumber(tokens[tokens.length - 8]);
        reachPct = cleanNumber(tokens[tokens.length - 7]) / 100.0;
        hours = cleanNumber(tokens[tokens.length - 3]);
      } else {
        // PDF 2 (Copa del Mundo)
        strAcc = cleanNumber(tokens[tokens.length - 3]);
        reachPct = cleanNumber(tokens[tokens.length - 2]) / 100.0;
        hours = 0; // El PDF de partidos no incluye horas por fila
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

    if (airtableRecords.length === 0) {
      const diagnosticLines = lines
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .slice(0, 25)
        .join('\n');

      return res.status(400).json({ 
        error: "No se encontraron filas estructuradas de shows dentro del PDF.",
        debugText: diagnosticLines || "El PDF parece no contener texto extraíble."
      });
    }

    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableToken = process.env.AIRTABLE_TOKEN;
    const tableName = "Metricas_Diarias";

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
          typecast: true
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(500).json({ error: "Error al escribir en Airtable.", details: errText });
      }
    }

    return res.status(200).json({ status: "success", count: airtableRecords.length });

  } catch (error) {
    console.error("Internal Server Error:", error);
    return res.status(500).json({ error: "Error interno durante la lectura del PDF.", details: error.message });
  }
}
