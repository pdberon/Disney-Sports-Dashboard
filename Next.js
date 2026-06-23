import { useState, useEffect } from 'react';
import { Card, Title, AreaChart, BarChart, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell } from '@tremor/react';

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState('All');

  useEffect(() => {
    // Consumir el JSON generado por el script de Python
    fetch('/data/traffic_distribution.json')
      .then(res => res.json())
      .then(data => setData(data));
  }, []);

  const filteredData = selectedMarket === 'All' 
    ? data 
    : data.filter(item => item.mercado === selectedMarket);

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <Title>Distribución de Tráfico Disney+ Sports</Title>
      
      {/* Selector de Mercado */}
      <div className="my-4">
        <select onChange={(e) => setSelectedMarket(e.target.value)} className="p-2 border rounded">
          <option value="All">Todos los Mercados</option>
          <option value="AR">Argentina</option>
          <option value="BR">Brasil</option>
          <option value="MX">México</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gráfico de Visualizaciones */}
        <Card>
          <Title>Cuentas Únicas por Programa</Title>
          <BarChart
            data={filteredData}
            index="programa"
            categories={["streaming_accounts"]}
            colors={["blue"]}
          />
        </Card>

        {/* Gráfico de Horas Reproducidas */}
        <Card>
          <Title>Horas de Streaming</Title>
          <AreaChart
            data={filteredData}
            index="programa"
            categories={["hours_streamed"]}
            colors={["emerald"]}
          />
        </Card>
      </div>
      
      {/* Tabla Detallada */}
      <Card className="mt-6">
        <Title>Detalle Diario Cruzado</Title>
        <Table className="mt-4">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Programa</TableHeaderCell>
              <TableHeaderCell>Liga</TableHeaderCell>
              <TableHeaderCell>Cuentas Activas</TableHeaderCell>
              <TableHeaderCell>Horas</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredData.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell>{item.programa}</TableCell>
                <TableCell>{item.liga}</TableCell>
                <TableCell>{item.streaming_accounts}</TableCell>
                <TableCell>{item.hours_streamed}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
