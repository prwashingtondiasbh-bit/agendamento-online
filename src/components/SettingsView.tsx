import React, { useState } from 'react';
import { Business } from '../types';
import { Settings, Building, Clock, DollarSign, Globe, Check } from 'lucide-react';

interface SettingsViewProps {
  business: Business;
  onUpdateBusiness: (updated: Partial<Business>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ business, onUpdateBusiness }) => {
  const [formData, setFormData] = useState({
    name: business.name || '',
    phone: business.phone || '',
    email: business.email || '',
    address: business.address || '',
    timezone: business.timezone || 'America/Sao_Paulo',
    currency: business.currency || 'BRL',
    openTime: business.openTime || '08:00',
    closeTime: business.closeTime || '20:00',
  });
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateBusiness(formData);
    setSuccessMsg('Configurações salvas com sucesso!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="max-w-3xl bg-white rounded-2xl border border-stone-200/80 shadow-sm p-8">
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
        <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-stone-900">Configurações do Estabelecimento</h3>
          <p className="text-xs text-stone-500">Definições gerais, fuso horário e horário de funcionamento</p>
        </div>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-medium flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Nome do Salão / Estúdio</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Telefone / WhatsApp</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">E-mail Comercial</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Endereço Completo</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Fuso Horário (Timezone)</label>
            <select
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            >
              <option value="America/Sao_Paulo">America/Sao_Paulo (Horário de Brasília)</option>
              <option value="America/Manaus">America/Manaus</option>
              <option value="America/Belem">America/Belem</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Moeda Padrão</label>
            <input
              type="text"
              value={formData.currency}
              disabled
              className="w-full px-4 py-2.5 bg-stone-100 border border-stone-200 rounded-xl text-sm text-stone-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Abertura do Expediente</label>
            <input
              type="time"
              value={formData.openTime}
              onChange={(e) => setFormData({ ...formData, openTime: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">Fechamento do Expediente</label>
            <input
              type="time"
              value={formData.closeTime}
              onChange={(e) => setFormData({ ...formData, closeTime: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>
        </div>

        <div className="pt-6 border-t border-stone-100 flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all"
          >
            Salvar Alterações
          </button>
        </div>
      </form>
    </div>
  );
};
