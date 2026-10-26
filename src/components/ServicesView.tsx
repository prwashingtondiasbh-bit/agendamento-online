import React, { useState } from 'react';
import { Service } from '../types';
import { Scissors, Plus, Clock, Tag } from 'lucide-react';

interface ServicesViewProps {
  services: Service[];
  onOpenNewService: () => void;
}

export const ServicesView: React.FC<ServicesViewProps> = ({ services, onOpenNewService }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = services.filter(
    s =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Scissors className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar serviço ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
          />
        </div>

        <button
          onClick={onOpenNewService}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Serviço</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((service) => (
          <div key={service.id} className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-start justify-between gap-4">
                <span className="px-3 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs font-semibold uppercase tracking-wider">
                  {service.category}
                </span>
                <span className="font-bold text-lg text-rose-600 tabular-nums">
                  {formatCurrency(Number(service.price))}
                </span>
              </div>

              <h3 className="font-bold text-stone-900 text-lg mt-4">{service.name}</h3>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{service.description || 'Sem descrição.'}</p>
            </div>

            <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500 font-medium">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-stone-400" />
                <span>{service.durationMin} minutos</span>
              </div>
              <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md font-semibold">Ativo</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
