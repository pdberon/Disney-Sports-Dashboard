import { useState } from 'react';
import Head from 'next/head';

export async function getServerSideProps() {
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
      }
    };
  } catch (error) {
    console.error("Error al obtener datos en ServerSide:", error);
    return {
      props: {
        metrics: [],
      }
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
        {/* Cargador directo de Tailwind para asegurar el diseño */}
        <script src="https://cdn.tailwindcss.com"></script>
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
              <option value="AR">Argentina</option>
              <option value="BR">Brasil</option>
              <option value="MX">México</option>
              <option value="CL">Chile</option>
              <option value="CO">Colombia</option>
            </select>
          </div>
        </header>

        {/* Tabla Detallada */}
        <div className="mt-6 bg-white shadow rounded-lg overflow-hidden border border-slate-200">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">Detalle Diario Cruzado</h2>
            <p className="text-slate-500 text-xs mt-1">Lista detallada procesada y vinculada desde Airtable.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Mercado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Programa / Show / Partido</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Liga</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cuentas Únicas</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Horas Visualizadas</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Reach %</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredMetrics.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{item.fecha}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-bold">{item.mercado}</td>
                    <td className="px-6 py-4 text-sm text-slate-900 font-medium">{item.programa}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{item.liga}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-mono text-right">{item.streaming_accounts.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-mono text-right">{item.hours_streamed.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-mono text-right">{(item.reach_pct * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
