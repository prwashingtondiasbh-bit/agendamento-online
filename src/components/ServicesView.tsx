import React, { useState } from 'react';
import { Service, Professional } from '../types';
import { Scissors, Plus, Clock, Edit, Power, CheckCircle2 } from 'lucide-react';

interface ServicesViewProps {
  services: Service[];
  professionals: Professional[];
  requireDeposit?: boolean;
  onOpenNewService: () => void;
  onEditService: (service: Service) => void;
  onDeleteService: (id: string) => void;
  onToggleActiveService?: (service: Service) => void;
}

export const ServicesView: React.FC<ServicesViewProps> = ({
  services,
  requireDeposit = true,
  onOpenNewService,
  onEditService,
  onDeleteService,
  onToggleActiveService,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const filtered = services.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.category.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'ACTIVE') return s.active !== false;
    if (statusFilter === 'INACTIVE') return s.active === false;
    return true;
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Scissors className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar serviço ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-full sm:w-auto">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-center ${
                  statusFilter === st ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {st === 'ALL' ? 'Todos' : st === 'ACTIVE' ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onOpenNewService}
          className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Serviço</span>
        </button>
      </div>

      <div className="bg-stone-50 border border-stone-200/70 rounded-xl px-4 py-2.5 text-xs text-stone-600 flex items-center justify-between">
        <span>
          <strong>Regra de integridade histórica:</strong> alterações de preço ou duração aplicam-se apenas a novos agendamentos, preservando os valores contratados nas reservas já registradas.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((service) => {
          const priceCents = Number(service.priceCents || 0);
          const depositPct = Number(service.depositPercent || 30);
          const depositCents = Math.round((priceCents * depositPct) / 100);
          const balanceCents = priceCents - depositCents;
          const isActive = service.active !== false;

          return (
            <div
              key={service.id}
              className={`bg-white rounded-2xl border shadow-sm p-6 flex flex-col justify-between transition-all ${
                isActive ? 'border-stone-200/80 hover:shadow-md' : 'border-stone-200/50 opacity-75 bg-stone-50/40'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <span className="px-3 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs font-semibold uppercase tracking-wider">
                    {service.category}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditService(service)}
                      title="Editar serviço"
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (onToggleActiveService) {
                          onToggleActiveService(service);
                        } else if (isActive) {
                          onDeleteService(service.id);
                        }
                      }}
                      title={isActive ? 'Desativar serviço' : 'Reativar serviço'}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isActive
                          ? 'text-rose-400 hover:text-rose-700 hover:bg-rose-50'
                          : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {isActive ? <Power className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-stone-900 text-lg mt-3">{service.name}</h3>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">{service.description || 'Sem descrição.'}</p>

                <div className="mt-4 pt-4 border-t border-stone-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-stone-600">
                    <span>Preço Total:</span>
                    <strong className="text-stone-900 font-bold text-sm tabular-nums">{formatCurrency(priceCents)}</strong>
                  </div>
                  {requireDeposit ? (
                    <>
                      <div className="flex justify-between items-center text-stone-600">
                        <span>Sinal Obrigatório ({depositPct}%):</span>
                        <span className="text-rose-600 font-semibold tabular-nums">{formatCurrency(depositCents)}</span>
                      </div>
                      <div className="flex justify-between items-center text-stone-600">
                        <span>Saldo Restante:</span>
                        <span className="text-stone-700 font-medium tabular-nums">{formatCurrency(balanceCents)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center text-stone-600">
                      <span>Cobrança na Reserva:</span>
                      <span className="text-emerald-700 font-semibold">Sem sinal antecipado</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500 font-medium">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-stone-400" />
                  <span>{service.durationMin} min</span>
                  {service.bufferAfterMin ? <span className="text-stone-400">(+{service.bufferAfterMin}m intervalo)</span> : null}
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-md font-semibold ${
                    isActive ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-stone-600 bg-stone-200/70'
                  }`}
                >
                  {isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
