import React from 'react';
import {
  Bell,
  CheckCircle,
  Calendar,
  CreditCard,
  Sparkles,
  CheckCheck,
  Clock,
} from 'lucide-react';

interface CustomerNotificationsProps {
  notifications: any[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export const CustomerNotifications: React.FC<CustomerNotificationsProps> = ({
  notifications,
  onMarkRead,
  onMarkAllRead,
}) => {
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'BOOKING_CONFIRMED':
        return <Calendar className="w-4 h-4 text-emerald-600" />;
      case 'PAYMENT_APPROVED':
        return <CreditCard className="w-4 h-4 text-rose-600" />;
      case 'WELCOME':
        return <Sparkles className="w-4 h-4 text-amber-600" />;
      default:
        return <Bell className="w-4 h-4 text-stone-600" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight font-serif">
            Notificações
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Confirmações de agendamentos, aprovações de Pix e avisos do salão.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition-all"
          >
            <CheckCheck className="w-3.5 h-3.5 text-stone-600" />
            <span>Marcar lidas</span>
          </button>
        )}
      </div>

      {/* Notifications List */}
      {notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((item) => (
            <div
              key={item.id}
              onClick={() => !item.read && onMarkRead(item.id)}
              className={`p-4 rounded-2xl border transition-all ${
                item.read
                  ? 'bg-white border-stone-200 text-stone-600'
                  : 'bg-rose-50/30 border-rose-200 text-stone-900 shadow-xs cursor-pointer hover:bg-rose-50/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  item.read ? 'bg-stone-100' : 'bg-rose-100'
                }`}>
                  {getIcon(item.type)}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-xs ${item.read ? 'font-semibold text-stone-800' : 'font-bold text-stone-950'}`}>
                      {item.title}
                    </h4>
                    <span className="text-[11px] text-stone-600 shrink-0">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs text-stone-600 leading-relaxed">
                    {item.message}
                  </p>
                </div>

                {!item.read && (
                  <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0 mt-1.5" title="Não lida"></span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto">
            <Bell className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-stone-900">
            Nenhuma notificação no momento
          </h3>
          <p className="text-stone-600 text-xs">
            Avisaremos você por aqui sempre que houver novidades sobre seus horários.
          </p>
        </div>
      )}
    </div>
  );
};
