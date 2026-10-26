import React, { useState } from 'react';
import { Professional } from '../types';
import { UserCheck, Plus, Mail, Phone, Award } from 'lucide-react';

interface ProfessionalsViewProps {
  professionals: Professional[];
  onOpenNewProfessional: () => void;
}

export const ProfessionalsView: React.FC<ProfessionalsViewProps> = ({ professionals, onOpenNewProfessional }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-bold text-stone-900 text-lg">Equipe de Manicures e Nail Designers</h3>
          <p className="text-xs text-stone-500">Profissionais ativos no estúdio</p>
        </div>

        <button
          onClick={onOpenNewProfessional}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Profissional</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {professionals.map((prof) => (
          <div key={prof.id} className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 flex flex-col items-center text-center">
            <img
              src={prof.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              alt={prof.name}
              className="w-20 h-20 rounded-full object-cover border-2 border-rose-500 shadow-md mb-4"
              referrerPolicy="no-referrer"
            />
            <h3 className="font-bold text-stone-900 text-lg">{prof.name}</h3>
            <p className="text-xs text-rose-600 font-medium bg-rose-50 px-3 py-1 rounded-full mt-1.5">
              {prof.specialty}
            </p>

            <div className="w-full mt-6 pt-4 border-t border-stone-100 space-y-2 text-xs text-stone-600 text-left">
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
          </div>
        ))}
      </div>
    </div>
  );
};
