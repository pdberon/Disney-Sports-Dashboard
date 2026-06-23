import { useState } from 'react';

export default function Admin() {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      alert("Por favor, selecciona un archivo PDF.");
      return;
    }

    setIsLoading(true);
    setMessage('');

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (response.ok) {
        setMessage(`¡Éxito! Se procesaron y subieron ${result.count} registros a Airtable.`);
        setFile(null);
      } else {
        setMessage(`Error: ${result.error || 'No se pudo procesar el archivo.'}`);
      }
    } catch (error) {
      setMessage(`Error de conexión: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-20 p-8 bg-white shadow-lg rounded-xl border border-slate-100 font-sans">
      <h1 className="text-2xl font-bold mb-3 text-slate-800">Panel de Ingesta Diaria</h1>
      <p className="text-slate-500 mb-6 text-sm">
        Sube el PDF diario de Looker para que el sistema extraiga las métricas, realice el cruce de datos y las envíe directamente a Airtable de forma segura.
      </p>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center transition bg-slate-50">
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files[0])}
            className="hidden"
            id="pdf-upload"
          />
          <label htmlFor="pdf-upload" className="cursor-pointer block">
            <span className="text-blue-600 hover:text-blue-800 font-semibold text-sm">
              {file ? `Archivo: ${file.name}` : "Haz clic aquí para seleccionar el PDF diario"}
            </span>
            <span className="block text-xs text-slate-400 mt-2">
              Formatos soportados: PDF de Looker con datos vectoriales
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading || !file}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg shadow-sm disabled:bg-slate-300 disabled:cursor-not-allowed transition"
        >
          {isLoading ? "Procesando y subiendo..." : "Procesar y Enviar a Airtable"}
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
    </div>
  );
}
