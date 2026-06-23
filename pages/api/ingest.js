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

// Función de renderizado inteligente con tolerancia de 5px para reconstruir filas
const render_page = (pageData) => {
  return pageData.getTextContent()
    .then((textContent) => {
      let lastY, text = '';
      for (let item of textContent.items) {
        const currentY = item.transform[5];
        
        // Si la diferencia vertical de coordenadas Y es menor a 5 píxeles,
        // consideramos que pertenecen a la misma fila horizontal y les inyectamos un espacio.
        if (!lastY || Math.abs(lastY - currentY) < 5) {
          text += ' ' + item.str;
        } else {
          text += '\n' + item.str;
        }
        lastY = currentY;
      }
      return text;
    });
};

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
    
    // Ejecutar pdf-parse usando el inyector de espacios por coordenadas
    const pdfData = await pdf(fileBuffer, { pagerender: render_page });
    
    let rawText = pdfData.text || "";
    // Normalizar espacios en blanco invisibles y reducir espacios duplicados
    let text = rawText.replace(/[\u00A0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ');
    text = text.replace(/[ \t]+/g, ' ');

    const lines = text.split(/\r?\n/);
    const airtableRecords = [];

    const DATE_REGEX = /(\d{4}[/-]\d{2}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/;
    const MARKET_REGEX = /\b(LATAM|CENAM|AR|BR|CL|CO|MX|EC|PE|UY|VE)\b/i;

    for (const line of lines) {
      const trimmed = line.trim();
      
      const dateMatch = trimmed.match(DATE_REGEX);
      if (!dateMatch) continue;
      const date = dateMatch[1];

      const countryMatch = trimmed.match(MARKET_REGEX);
      if (!countryMatch) continue;
      const market = countryMatch[1].toUpperCase();

      let lineWithoutDate = trimmed.replace(date, '').trim();
      const countryRegex = new RegExp(`\\b${market}\\b`, 'i');
      let cleanLine = lineWithoutDate.replace(countryRegex, '').trim();

      const tokens = cleanLine.match(/[\d,.]+%?/g);
      if (!tokens || tokens.length < 3) continue;

      let firstMetricToken = tokens[tokens.length >= 8 ? tokens.length - 8 : tokens.length - 3];
      
      // Corrección crítica: Buscamos el token numérico desde la derecha (lastIndexOf) 
      // para evitar colisiones con números en el título o índice de fila.
      const metricIndex = cleanLine.lastIndexOf(firstMetricToken);
      if (metricIndex === -1) continue;

      let middleString = cleanLine.substring(0, metricIndex).trim();
      
      // Limpiar índice inicial de fila (ej. "1 ", "2 ")
      middleString = middleString.replace(/^\d+\s+/, '').trim();

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
        title = title.replace(/\s*\|\s*Closs.*/gi, '')
                     .replace(/\s*\|\s*Relato.*/gi, '')
                     .trim();
        
        programId = title; 
      }

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
        hours = 0;
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
