import { useState } from 'react';
import Head from 'next/head';

export async function getStaticProps() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = "Metricas_Diarias";
  const url = `https://api.airtable.com/v0/${baseId}/${tableName}?maxRecords=100&view=Grid%20view`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`
      }
    });

    if (!res.ok) {
      throw new Error(`Airtable retornó un error: ${res.statusText}`);
    }

    const rawData = await res.json();

    // Mapeamos los datos de Airtable.
    // Los campos del show mapeados por relación ('PROGRAM_FULL_TITLE', etc.) son devueltos por la API de Airtable como arrays.
    const metrics = rawData.records.map(record => ({
      id: record.id,
      fecha: record.fields.Date || "Sin fecha",
      mercado: record.fields.Market || "N/A",
      streaming_accounts: record.fields.Streaming_Accounts || 0,
      hours_streamed: record.fields.Hours_Streamed || 0,
      reach_pct: record.fields.Reach_Percent || 0.0,
      programa: record.fields.PROGRAM_FULL_TITLE?.[0] || "Show Desconocido",
      liga: record.fields.LEAGUE_FULL?.[0] || "N/A",
      canal: record.fields.CHANNEL_NAME?.[0] || "N/A"
    }));

    return {
      props: {
        metrics,
      },
      // Revalida y actualiza los datos del servidor de manera estática cada 1 hora
      revalidate: 3600,
    };
  } catch (error) {
    console.error("Error al obtener datos en Build Time:", error);
    return {
      props: {
        metrics: [],
      },
      revalidate: 10, // Reintento rápido si falla
    };
  }
}

export default function Home({ metrics }) {
  const [selectedMarket, setSelectedMarket] = useState('All');

  const filteredMetrics = selectedMarket === 'All'
    ? metrics
    : metrics.filter(item => item.mercado === selectedMarket);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-6 sm:px-8 font-sans">
      <Head>
        <title>Disney+ Sports Analytics</title>
      </Head>

      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Métricas de Consumo Deportivo</h1>
            <p className="text-slate-500 text-sm mt-1">Consolidador de rendimiento de transmisiones en directo y shows.</p>
          </div>

          <div className="mt-4 md:mt-0 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Filtrar por Mercado:</span>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">Todos los Mercados</option>
              <option value="LATAM">LATAM (General)</option>
              <option value="BR">Brasil</option>
              <option value="MX">México</option>
              <option value="AR">Argentina</option>
              <option value="CL">Chile</option>
              <option value="CO">Colombia</option>
              <option value="CENAM">Centroamérica</option>
            </select>
          </div>
        </header>

        {/* Tabla de Rendimiento de Shows */}
        <main className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Detalle de Shows de Deportes</h2>
            <p className="text-xs text-slate-400 mt-1">Lista detallada procesada y vinculada desde Airtable.</p>
          </div>

          <div className="overflow-x-auto">
            {filteredMetrics.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                No hay registros disponibles para mostrar. Sube datos desde la sección de administración.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Mercado</th>
                    <th className="p-4">Programa / Show</th>
                    <th className="p-4">Liga</th>
                    <th className="p-4 text-right">Cuentas Únicas</th>
                    <th className="p-4 text-right">Horas Visualizadas</th>
                    <th className="p-4 text-right">Reach %</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 text-sm divide-y divide-slate-100">
                  {filteredMetrics.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-4 font-medium text-slate-900">{item.fecha}</td>
                      <td className="p-4">
                        <span className="bg-slate-100 text-slate-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                          {item.mercado}
                        </span>
                      </td>
                      <td className="p-4 font-medium text-slate-900">{item.programa}</td>
                      <td className="p-4 text-slate-500">{item.liga}</td>
                      <td className="p-4 text-right font-mono">{item.streaming_accounts.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono">{item.hours_streamed.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                      <td className="p-4 text-right font-mono">{(item.reach_pct * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
