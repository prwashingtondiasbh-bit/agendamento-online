import React, { useState } from 'react';
import {
  User,
  Phone,
  Mail,
  MessageSquare,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Save,
  Loader2,
} from 'lucide-react';

interface CustomerProfileProps {
  customer: any;
  business: any;
  onUpdateProfile: (data: any) => Promise<{ success: boolean; error?: string }>;
}

export const CustomerProfile: React.FC<CustomerProfileProps> = ({
  customer,
  business,
  onUpdateProfile,
}) => {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [contactPreference, setContactPreference] = useState<'WHATSAPP' | 'SMS' | 'EMAIL'>(
    customer?.contactPreference || 'WHATSAPP'
  );

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!name.trim()) {
      setErrorMessage('Por favor, informe seu nome completo.');
      return;
    }

    if (!phone.trim()) {
      setErrorMessage('Por favor, informe seu telefone com DDD.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Por favor, informe um endereço de e-mail válido.');
      return;
    }

    setSaving(true);
    try {
      const res = await onUpdateProfile({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        contactPreference,
      });

      if (res.success) {
        setSuccessMessage('Seus dados foram atualizados com sucesso!');
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        setErrorMessage(res.error || 'Erro ao salvar alterações');
      }
    } catch {
      setErrorMessage('Falha na comunicação com o servidor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-stone-900 tracking-tight font-serif">
          Meus Dados Cadastrais
        </h2>
        <p className="text-xs text-stone-600 mt-0.5">
          Mantenha suas informações de contato atualizadas para receber lembretes de agendamento.
        </p>
      </div>

      {/* Feedback Messages */}
      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 shadow-sm space-y-5">
        <div className="space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Nome Completo
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 min-h-[42px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all text-stone-900"
                placeholder="Ex: Beatriz Lima"
              />
            </div>
          </div>

          {/* Telefone / WhatsApp */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Telefone / WhatsApp (com DDD)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 min-h-[42px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all text-stone-900"
                placeholder="(11) 98765-4321"
              />
            </div>
            <span className="text-[11px] text-stone-600 block mt-1">
              Utilizado para envio do lembrete automático e chave Pix de pagamento.
            </span>
          </div>

          {/* E-mail */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              E-mail de Acesso
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 min-h-[42px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all text-stone-900"
                placeholder="beatriz@email.com"
              />
            </div>
          </div>

          {/* Preferência de Contato */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Canal Preferencial para Lembretes e Confirmações
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageSquare },
                { id: 'SMS', label: 'SMS', icon: Phone },
                { id: 'EMAIL', label: 'E-mail', icon: Mail },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = contactPreference === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setContactPreference(item.id as any)}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 min-h-[42px] rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-rose-500 bg-rose-50/60 text-rose-700 font-semibold shadow-xs'
                        : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LGPD Protection Notice */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 text-stone-600 text-[11px] flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <strong className="text-stone-800 font-semibold block">
                Privacidade & Proteção de Dados (LGPD)
              </strong>
              <span>
                Seus dados cadastrais são protegidos e utilizados exclusivamente pelo estabelecimento {business?.name || 'Agenda Beauty'} para gestão da sua agenda e emissão dos comprovantes Pix.
              </span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-3 border-t border-stone-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
