export async function getStaticProps() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = "Metricas_Diarias";
  const url = `https://api.airtable.com/v0/${baseId}/${tableName}?view=Grid%20view`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`
    }
  });
  
  const rawData = await res.json();
  
  // Mapeamos los datos de Airtable para el Dashboard
  const metrics = rawData.records.map(record => ({
    id: record.id,
    fecha: record.fields.Date,
    mercado: record.fields.Market,
    streaming_accounts: record.fields.Streaming_Accounts,
    hours_streamed: record.fields.Hours_Streamed,
    // Airtable nos devuelve los campos de la tabla enlazada Metadatos_Programas como arrays
    programa: record.fields.PROGRAM_FULL_TITLE?.[0] || "Show Desconocido",
    liga: record.fields.LEAGUE_FULL?.[0] || "N/A"
  }));

  return {
    props: {
      metrics,
    },
    // ISR: Vercel regenerará la página como máximo una vez cada hora (3600 segundos)
    revalidate: 3600, 
  };
}

export default function Home({ metrics }) {
  // Aquí renderizas tu componente de Dashboard utilizando la prop 'metrics'
}
