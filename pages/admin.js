import { useState } from 'react';
import Head from 'next/head';

export default function Admin() {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [debugText, setDebugText] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      alert("Por favor, selecciona un archivo PDF.");
      return;
    }

    setIsLoading(true);
    setMessage('');
    setDebugText('');

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(`¡Éxito! Se procesaron y cargaron ${result.count} registros a Airtable.`);
        setFile(null);
      } else {
        setMessage(`Error: ${result.error || 'No se pudo procesar el archivo.'}`);
        if (result.debugText) {
          setDebugText(result.debugText);
        }
      }
    } catch (error) {
      setMessage(`Error de conexión: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <Head>
        <title>Ingesta de Métricas - Dashboard</title>
      </Head>

      <div className="max-w-xl w-full mx-auto bg-white p-8 rounded-2xl shadow-md border border-slate-100">
        <h1 className="text-2xl font-bold mb-2 text-slate-800">Panel de Ingesta Diaria</h1>
        <p className="text-slate-500 mb-6 text-sm">
          Sube el PDF diario para procesar las métricas de deportes e ingresarlas automáticamente en tu base de datos de Airtable.
        </p>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center transition bg-slate-50/50">
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files[0])}
              className="bg-white p-2 w-full text-sm border rounded cursor-pointer"
              id="pdf-upload"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !file}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg shadow-sm disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            {isLoading ? "Procesando..." : "Subir a Airtable"}
          </button>
        </form>

        {message && (
          <div className={`mt-6 p-4 rounded-lg text-sm border ${
            message.startsWith('¡Éxito!') 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {message}
          </div>
        )}

        {debugText && (
          <div className="mt-6 p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto border border-slate-800">
            <h3 className="font-bold text-slate-400 mb-2 uppercase tracking-wide">
              Texto extraído para diagnóstico (Primeras líneas):
            </h3>
            <pre className="whitespace-pre-wrap">{debugText}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
