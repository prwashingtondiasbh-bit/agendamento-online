import React, { useState } from 'react';
import { Client } from '../types';
import { Users, Search, Plus, Phone, Mail, FileText } from 'lucide-react';

interface ClientsViewProps {
  clients: Client[];
  onOpenNewClient: () => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ clients, onOpenNewClient }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = clients.filter(
    c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Bar with Search & Add Button */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar cliente por nome ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
          />
        </div>

        <button
          onClick={onOpenNewClient}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Cliente</span>
        </button>
      </div>

      {/* Clients Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200/80 p-12 text-center text-stone-400 shadow-sm">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhum cliente cadastrado.</p>
          <button
            onClick={onOpenNewClient}
            className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-medium hover:bg-stone-800 transition-colors"
          >
            Adicionar Primeiro Cliente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((client) => (
            <div key={client.id} className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 font-bold flex items-center justify-center text-lg">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-stone-400 font-mono">
                    ID: {client.id.slice(-6)}
                  </span>
                </div>

                <h3 className="font-bold text-stone-900 text-lg mt-4">{client.name}</h3>

                <div className="mt-4 space-y-2 text-sm text-stone-600">
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-stone-400 shrink-0" />
                    <span className="font-mono text-xs">{client.phone}</span>
                  </div>
                  {client.email && (
                    <div className="flex items-center gap-2.5">
                      <Mail className="w-4 h-4 text-stone-400 shrink-0" />
                      <span className="truncate text-xs">{client.email}</span>
                    </div>
                  )}
                  {client.notes && (
                    <div className="flex items-start gap-2.5 mt-2 pt-2 border-t border-stone-100">
                      <FileText className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-stone-500 italic">{client.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
                <span>Cliente Agenda Beauty</span>
                <span className="text-rose-600 font-medium cursor-pointer hover:underline">Ver Histórico</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
