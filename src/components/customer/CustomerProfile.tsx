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
  Lock,
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
  const [preferences, setPreferences] = useState(customer?.preferences || customer?.notes || '');
  const [contactPreference, setContactPreference] = useState(customer?.contactPreference || 'WHATSAPP');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    const res = await onUpdateProfile({
      name,
      phone,
      email,
      preferences,
      contactPreference,
    });
    setSaving(false);
    if (res.success) {
      setFeedback({ type: 'success', message: 'Perfil atualizado com sucesso!' });
    } else {
      setFeedback({ type: 'error', message: res.error || 'Erro ao atualizar perfil.' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'Preencha todos os campos de senha.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'A nova senha e a confirmação não conferem.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordFeedback({ type: 'error', message: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    setChangingPassword(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('agenda_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-session-token'] = token;
      }
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao alterar senha.');
      }
      setPasswordFeedback({ type: 'success', message: 'Senha alterada com sucesso!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordFeedback({ type: 'error', message: err.message || 'Erro ao alterar senha.' });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Profile Info Form */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-bold text-stone-900 font-serif">Meu Perfil & Cadastro</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Atualize seus dados pessoais e preferências de contato para o estabelecimento.
          </p>
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
              Nome Completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
              Observações / Preferências Pessoais
            </label>
            <textarea
              rows={3}
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="Ex: Alergias, formato preferido, restrições..."
              className="w-full px-3.5 py-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-2">
              Canal Preferido de Contato
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
                Seus dados cadastrais são protegidos e utilizados exclusivamente pelo estabelecimento {business?.name || 'Nuvem Agenda'} para gestão da sua agenda e emissão dos comprovantes Pix.
              </span>
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

      {/* Change Password Card */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 font-serif">Segurança & Senha de Acesso</h2>
            <p className="text-xs text-stone-500">Altere sua senha de login com segurança.</p>
          </div>
        </div>

        {passwordFeedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
              passwordFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {passwordFeedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{passwordFeedback.message}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
              Senha Atual
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                Nova Senha
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-stone-600 mb-1.5">
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repita a nova senha"
                className="w-full px-3.5 py-2.5 min-h-[44px] text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-stone-900"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-stone-100 flex justify-end">
            <button
              type="submit"
              disabled={changingPassword}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              {changingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Alterando...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Alterar Senha</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
