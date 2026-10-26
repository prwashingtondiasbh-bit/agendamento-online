import React, { useState } from 'react';
import { Client, Professional, Service } from '../types';
import { X, Calendar, User, Scissors, DollarSign } from 'lucide-react';

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  professionals: Professional[];
  services: Service[];
  onSubmit: (data: { clientId: string; professionalId: string; serviceId: string; dateTime: string; notes?: string }) => void;
}

export const NewAppointmentModal: React.FC<NewAppointmentModalProps> = ({
  isOpen,
  onClose,
  clients,
  professionals,
  services,
  onSubmit,
}) => {
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id || '');
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [dateTime, setDateTime] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !professionalId || !serviceId || !dateTime) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }
    onSubmit({ clientId, professionalId, serviceId, dateTime: new Date(dateTime).toISOString(), notes });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-stone-200">
        <div className="px-6 py-5 bg-stone-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-rose-500" />
            <span>Novo Agendamento</span>
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Cliente</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              required
            >
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Profissional (Nail Designer)</label>
            <select
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              required
            >
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.name} - {p.specialty}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Serviço</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              required
            >
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min) - R$ {Number(s.price).toFixed(2)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Data e Horário</label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Observações (Opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Formato almond, cor de esmalte..."
              rows={3}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 resize-none"
            />
          </div>

          <div className="pt-4 border-t border-stone-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-xl text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium shadow-sm transition-all"
            >
              Confirmar Agendamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface NewClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; phone: string; email?: string; notes?: string }) => void;
}

export const NewClientModal: React.FC<NewClientModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      alert('Nome e telefone são obrigatórios.');
      return;
    }
    onSubmit({ name, phone, email, notes });
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-stone-200">
        <div className="px-6 py-5 bg-stone-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-rose-500" />
            <span>Cadastrar Cliente</span>
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Nome Completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Beatriz Lima"
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Telefone / WhatsApp</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">E-mail (Opcional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="beatriz@email.com"
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Observações / Preferências</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Alergias, formato preferido..."
              rows={2}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 resize-none"
            />
          </div>

          <div className="pt-4 border-t border-stone-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-xl text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium shadow-sm transition-all"
            >
              Salvar Cliente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface NewServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string; durationMin: number; price: number; category: string }) => void;
}

export const NewServiceModal: React.FC<NewServiceModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMin, setDurationMin] = useState(60);
  const [price, setPrice] = useState(100);
  const [category, setCategory] = useState('Alongamento');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) {
      alert('Nome e preço são obrigatórios.');
      return;
    }
    onSubmit({ name, description, durationMin: Number(durationMin), price: Number(price), category });
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-stone-200">
        <div className="px-6 py-5 bg-stone-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Scissors className="w-5 h-5 text-rose-500" />
            <span>Cadastrar Serviço</span>
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Nome do Serviço</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Banho de Gel"
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            >
              <option value="Alongamento">Alongamento</option>
              <option value="Esmaltação">Esmaltação</option>
              <option value="Manicure">Manicure</option>
              <option value="Tratamento">Tratamento</option>
              <option value="Nail Art">Nail Art</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Duração (minutos)</label>
              <input
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes do procedimento..."
              rows={2}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 resize-none"
            />
          </div>

          <div className="pt-4 border-t border-stone-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-xl text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium shadow-sm transition-all"
            >
              Salvar Serviço
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
