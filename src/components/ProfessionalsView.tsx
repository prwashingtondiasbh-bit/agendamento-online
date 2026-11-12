import React from 'react';
import { Professional } from '../types';
import { Plus, Mail, Phone, Clock, Calendar, Edit, Power, CheckCircle2 } from 'lucide-react';

interface ProfessionalsViewProps {
  professionals: Professional[];
  onOpenNewProfessional: () => void;
  onEditProfessional: (professional: Professional) => void;
  onDeleteProfessional: (id: string) => void;
  onToggleActiveProfessional?: (professional: Professional) => void;
  onViewProfessionalAgenda?: (professionalId: string) => void;
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const ProfessionalsView: React.FC<ProfessionalsViewProps> = ({
  professionals,
  onOpenNewProfessional,
  onEditProfessional,
  onDeleteProfessional,
  onToggleActiveProfessional,
  onViewProfessionalAgenda,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-stone-900 text-lg">Equipe de Profissionais e Escalas</h3>
          <p className="text-xs text-stone-500">
            Configure dias e horários de trabalho, intervalos de almoço e consulte a agenda individual
          </p>
        </div>

        <button
          onClick={onOpenNewProfessional}
          className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Profissional</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {professionals.map((prof) => {
          const isActive = prof.active !== false;
          const whList = Array.isArray(prof.workingHours) ? prof.workingHours : [];

          return (
            <div
              key={prof.id}
              className={`bg-white rounded-2xl border shadow-sm p-6 flex flex-col justify-between transition-all ${
                isActive ? 'border-stone-200/80' : 'border-stone-200/50 opacity-75 bg-stone-50/50'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <img
                    src={prof.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={prof.name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-rose-500 shadow-md mb-3"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditProfessional(prof)}
                      title="Editar dados e jornada de trabalho"
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (onToggleActiveProfessional) {
                          onToggleActiveProfessional(prof);
                        } else if (isActive) {
                          onDeleteProfessional(prof.id);
                        }
                      }}
                      title={isActive ? 'Desativar profissional' : 'Reativar profissional'}
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

                <h3 className="font-bold text-stone-900 text-lg">{prof.name}</h3>
                <p className="text-xs text-rose-600 font-medium bg-rose-50 px-3 py-1 rounded-full mt-1.5 inline-block">
                  {prof.specialty}
                </p>

                <div className="mt-4 pt-4 border-t border-stone-100 space-y-2 text-xs text-stone-600">
                  {prof.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-stone-400" />
                      <span className="font-mono">{prof.phone}</span>
                    </div>
                  )}
                  {prof.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-stone-400" />
                      <span className="truncate">{prof.email}</span>
                    </div>
                  )}
                </div>

                {/* Working Hours Summary */}
                <div className="mt-4 pt-3 border-t border-stone-100">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">
                    Dias e Horários de Trabalho
                  </p>
                  {whList.length === 0 ? (
                    <p className="text-xs text-stone-400">Escala padrão do estabelecimento (09:00 às 19:00)</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {whList.map((wh, idx) => (
                        <span
                          key={wh.id || idx}
                          className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-[11px] font-medium"
                          title={wh.breakStart ? `Intervalo: ${wh.breakStart} - ${wh.breakEnd}` : undefined}
                        >
                          {DAY_NAMES[wh.dayOfWeek] || wh.dayOfWeek}: {wh.startTime}-{wh.endTime}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between gap-2 text-xs text-stone-500">
                {onViewProfessionalAgenda ? (
                  <button
                    onClick={() => onViewProfessionalAgenda(prof.id)}
                    className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-semibold"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Ver Agenda Individual</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    <span>Escala ativa</span>
                  </span>
                )}
                <span
                  className={`px-2.5 py-0.5 rounded-md font-semibold ${
                    isActive ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-stone-600 bg-stone-200/70'
                  }`}
                >
                  {isActive ? 'Ativa' : 'Inativa'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
