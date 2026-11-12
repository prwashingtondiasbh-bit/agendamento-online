import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Award,
  Tag,
  Package,
  Gift,
  Star,
  Megaphone,
  Boxes,
  MapPin,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  ShieldAlert,
  EyeOff,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { Client, Professional, Service } from '../types';
import { apiFetch } from '../App';

interface AdvancedViewProps {
  userRole: string;
  clients: Client[];
  services: Service[];
  professionals: Professional[];
  onRefreshCoreData: () => void;
}

type ModuleTab =
  | 'waitlist'
  | 'loyalty'
  | 'coupons'
  | 'packages'
  | 'giftcards'
  | 'reviews'
  | 'campaigns'
  | 'inventory'
  | 'locations';

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents || 0) / 100);
}

export const AdvancedView: React.FC<AdvancedViewProps> = ({
  userRole,
  clients,
  services,
  professionals,
  onRefreshCoreData,
}) => {
  const canManage = userRole === 'SUPER_ADMIN' || userRole === 'OWNER' || userRole === 'MANAGER';

  const [activeTab, setActiveTab] = useState<ModuleTab>('waitlist');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Module states
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [packagesData, setPackagesData] = useState<any>({
    catalog: [],
    customerPackages: [],
    usageLedger: [],
  });
  const [giftCardsData, setGiftCardsData] = useState<any>({ cards: [], transactions: [] });
  const [reviewsData, setReviewsData] = useState<any>({
    averageRating: 0,
    totalReviews: 0,
    distribution: {},
    reviews: [],
  });
  const [campaignsData, setCampaignsData] = useState<any>({ campaigns: [], preview: null });
  const [inventoryData, setInventoryData] = useState<any>({
    products: [],
    movements: [],
    alerts: { belowMinStock: [], outOfStock: [] },
  });
  const [locations, setLocations] = useState<any[]>([]);

  // Waitlist form
  const [wlClientId, setWlClientId] = useState(clients[0]?.id || '');
  const [wlServiceId, setWlServiceId] = useState(services[0]?.id || '');
  const [wlProfId, setWlProfId] = useState('');
  const [wlDate, setWlDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [wlPeriod, setWlPeriod] = useState('ANY');
  const [offerSlotDateTime, setOfferSlotDateTime] = useState(
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16)
  );

  // Loyalty form
  const [adjClientId, setAdjClientId] = useState(clients[0]?.id || '');
  const [adjPoints, setAdjPoints] = useState(50);
  const [adjJustification, setAdjJustification] = useState('');
  const [rewName, setRewName] = useState('');
  const [rewPoints, setRewPoints] = useState(100);
  const [rewDiscountReais, setRewDiscountReais] = useState('25');

  // Coupon form
  const [cpnCode, setCpnCode] = useState('');
  const [cpnName, setCpnName] = useState('');
  const [cpnType, setCpnType] = useState<'PERCENTAGE' | 'FIXED_CENTS'>('PERCENTAGE');
  const [cpnValue, setCpnValue] = useState('15');
  const [cpnMinReais, setCpnMinReais] = useState('100');
  const [cpnMaxUses, setCpnMaxUses] = useState('50');
  const [cpnFirstOnly, setCpnFirstOnly] = useState(false);

  // Package form
  const [pkgName, setPkgName] = useState('');
  const [pkgServiceId, setPkgServiceId] = useState(services[0]?.id || '');
  const [pkgQty, setPkgQty] = useState(4);
  const [pkgPriceReais, setPkgPriceReais] = useState('360');
  const [buyPkgId, setBuyPkgId] = useState('');
  const [buyClientId, setBuyClientId] = useState(clients[0]?.id || '');
  const [buyConfirmed, setBuyConfirmed] = useState(true);

  // Gift card form
  const [gcAmountReais, setGcAmountReais] = useState('150');
  const [gcRecipient, setGcRecipient] = useState('');
  const [gcMessage, setGcMessage] = useState('');
  const [gcConfirmed, setGcConfirmed] = useState(true);

  // Campaign form
  const [cmpName, setCmpName] = useState('');
  const [cmpObjective, setCmpObjective] = useState('Retorno de clientes com benefício exclusivo');
  const [cmpSegment, setCmpSegment] = useState('PROMOTIONAL_OPT_IN');
  const [cmpCoupon, setCmpCoupon] = useState('');
  const [cmpMessage, setCmpMessage] = useState(
    'Preparamos uma condição especial para o seu próximo cuidado de beleza conosco!'
  );

  // Inventory form
  const [prdName, setPrdName] = useState('');
  const [prdSku, setPrdSku] = useState('');
  const [prdCategory, setPrdCategory] = useState('INSUMOS');
  const [prdQty, setPrdQty] = useState(10);
  const [prdMinQty, setPrdMinQty] = useState(5);
  const [prdCostReais, setPrdCostReais] = useState('35');
  const [movPrdId, setMovPrdId] = useState('');
  const [movType, setMovType] = useState('IN');
  const [movDelta, setMovDelta] = useState(5);
  const [movReason, setMovReason] = useState('');

  // Location form
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locPhone, setLocPhone] = useState('');

  const loadModuleData = useCallback(async () => {
    try {
      const [wlRes, loyRes, cpnRes, pkgRes, gcRes, revRes, cmpRes, invRes, locRes] =
        await Promise.all([
          apiFetch('/api/v1/advanced/waitlist'),
          apiFetch('/api/v1/advanced/loyalty'),
          apiFetch('/api/v1/advanced/coupons'),
          apiFetch('/api/v1/advanced/packages'),
          apiFetch('/api/v1/advanced/gift-cards'),
          apiFetch('/api/v1/advanced/reviews'),
          canManage
            ? apiFetch(`/api/v1/advanced/campaigns?segmentType=${cmpSegment}`)
            : Promise.resolve(null),
          apiFetch('/api/v1/advanced/inventory'),
          apiFetch('/api/v1/advanced/locations'),
        ]);

      const [wlJson, loyJson, cpnJson, pkgJson, gcJson, revJson, cmpJson, invJson, locJson] =
        await Promise.all([
          wlRes.json().catch(() => ({})),
          loyRes.json().catch(() => ({})),
          cpnRes.json().catch(() => ({})),
          pkgRes.json().catch(() => ({})),
          gcRes.json().catch(() => ({})),
          revRes.json().catch(() => ({})),
          cmpRes ? cmpRes.json().catch(() => ({})) : Promise.resolve({}),
          invRes.json().catch(() => ({})),
          locRes.json().catch(() => ({})),
        ]);

      if (wlJson.success) setWaitlist(wlJson.data || []);
      if (loyJson.success) setLoyaltyData(loyJson.data);
      if (cpnJson.success) setCoupons(cpnJson.data || []);
      if (pkgJson.success && pkgJson.data) {
        setPackagesData(pkgJson.data);
        if (!buyPkgId && pkgJson.data.catalog?.[0]?.id) {
          setBuyPkgId(pkgJson.data.catalog[0].id);
        }
      }
      if (gcJson.success && gcJson.data) setGiftCardsData(gcJson.data);
      if (revJson.success && revJson.data) setReviewsData(revJson.data);
      if (cmpJson?.success && cmpJson.data) setCampaignsData(cmpJson.data);
      if (invJson.success && invJson.data) {
        setInventoryData(invJson.data);
        if (!movPrdId && invJson.data.products?.[0]?.id) {
          setMovPrdId(invJson.data.products[0].id);
        }
      }
      if (locJson.success) setLocations(locJson.data || []);
    } catch (e) {
      console.error('Failed to load Etapa 11 data:', e);
    }
  }, [canManage, cmpSegment, buyPkgId, movPrdId]);

  useEffect(() => {
    loadModuleData();
  }, [loadModuleData]);

  // Handlers
  const handleCreateWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: wlClientId,
        serviceId: wlServiceId,
        professionalId: wlProfId || null,
        desiredDate: wlDate,
        preferredPeriod: wlPeriod,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Cliente adicionada à lista de espera inteligente!' });
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao registrar lista de espera.' });
    }
  };

  const handleOfferWaitlistSlot = async (entry: any) => {
    setFeedback(null);
    const profId = entry.professionalId || professionals[0]?.id;
    const res = await apiFetch(`/api/v1/advanced/waitlist/${entry.id}/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        professionalId: profId,
        slotDateTime: new Date(offerSlotDateTime).toISOString(),
        expiresInMinutes: 30,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: 'success',
        text: 'Oferta de horário enviada! A vaga ficará reservada temporariamente aguardando resposta.',
      });
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao ofertar horário.' });
    }
  };

  const handleAcceptWaitlistOffer = async (offerId: string) => {
    setFeedback(null);
    const res = await apiFetch(`/api/v1/advanced/waitlist/offers/${offerId}/accept`, {
      method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: 'success',
        text: 'Oferta aceita! Reserva criada no calendário principal com sucesso.',
      });
      loadModuleData();
      onRefreshCoreData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Não foi possível aceitar a oferta.' });
    }
  };

  const handleManualLoyaltyAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/loyalty/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: adjClientId,
        pointsDelta: Number(adjPoints),
        justification: adjJustification,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Ajuste manual de pontos registrado com auditoria.' });
      setAdjJustification('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao ajustar pontos.' });
    }
  };

  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/loyalty/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: rewName,
        pointsRequired: Number(rewPoints),
        rewardType: 'DISCOUNT_CENTS',
        discountCents: Math.round(Number(rewDiscountReais) * 100),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Nova recompensa de fidelidade cadastrada!' });
      setRewName('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao criar recompensa.' });
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: cpnCode,
        name: cpnName || cpnCode,
        discountType: cpnType,
        discountValue:
          cpnType === 'FIXED_CENTS' ? Math.round(Number(cpnValue) * 100) : Number(cpnValue),
        minPurchaseCents: Math.round(Number(cpnMinReais || 0) * 100),
        maxTotalUses: Number(cpnMaxUses || 50),
        firstPurchaseOnly: cpnFirstOnly,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: `Cupom ${json.data.code} criado com sucesso!` });
      setCpnCode('');
      setCpnName('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao salvar cupom.' });
    }
  };

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: pkgName,
        items: [{ serviceId: pkgServiceId, quantity: Number(pkgQty) }],
        totalPriceCents: Math.round(Number(pkgPriceReais) * 100),
        validityDays: 90,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Pacote de serviços cadastrado no catálogo!' });
      setPkgName('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao cadastrar pacote.' });
    }
  };

  const handlePurchasePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/packages/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageId: buyPkgId,
        clientId: buyClientId,
        paymentConfirmed: buyConfirmed,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: 'success',
        text: buyConfirmed
          ? 'Pacote vendido com pagamento confirmado! Receita registrada no financeiro e créditos liberados.'
          : 'Pacote registrado como AGUARDANDO PAGAMENTO (créditos bloqueados até confirmação).',
      });
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao registrar venda de pacote.' });
    }
  };

  const handleConsumePackageSlot = async (customerPackageId: string, serviceId: string) => {
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/packages/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerPackageId, serviceId }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: 'success',
        text: '1 sessão consumida do pacote com sucesso (sem duplicar receita no caixa).',
      });
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao consumir crédito.' });
    }
  };

  const handleCreateGiftCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/gift-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initialBalanceCents: Math.round(Number(gcAmountReais) * 100),
        recipientName: gcRecipient,
        personalMessage: gcMessage,
        paymentConfirmed: gcConfirmed,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: 'success',
        text: `Cartão-presente emitido com código seguro: ${json.data.code}`,
      });
      setGcRecipient('');
      setGcMessage('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao emitir cartão-presente.' });
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cmpName,
        objective: cmpObjective,
        segmentType: cmpSegment,
        couponCode: cmpCoupon || null,
        messagePreview: cmpMessage,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({
        type: 'success',
        text: 'Campanha criada em rascunho. Revise a audiência e confirme o disparo.',
      });
      setCmpName('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao criar campanha.' });
    }
  };

  const handleDispatchCampaign = async (campaignId: string) => {
    setFeedback(null);
    const res = await apiFetch(`/api/v1/advanced/campaigns/${campaignId}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmDispatch: true }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      const s = json.data.summary;
      setFeedback({
        type: 'success',
        text: `Campanha processada: ${s.sentOrQueued} enviada(s)/enfileirada(s), ${s.skippedNoConsent} ignorada(s) por falta de opt-in promocional, ${s.failedCount} falha(s) de credenciais/envio.`,
      });
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao disparar campanha.' });
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/inventory/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: prdName,
        sku: prdSku,
        category: prdCategory,
        currentQuantity: Number(prdQty),
        minQuantity: Number(prdMinQty),
        unitCostCents: Math.round(Number(prdCostReais) * 100),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Produto cadastrado no estoque!' });
      setPrdName('');
      setPrdSku('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao cadastrar produto.' });
    }
  };

  const handleRecordInventoryMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const delta =
      movType === 'MANUAL_OUT' || movType === 'LOSS'
        ? -Math.abs(Number(movDelta))
        : Number(movDelta);
    const res = await apiFetch('/api/v1/advanced/inventory/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: movPrdId,
        type: movType,
        quantityDelta: delta,
        reason: movReason,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Movimentação de estoque registrada com auditoria!' });
      setMovReason('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao movimentar estoque.' });
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/v1/advanced/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: locName,
        address: locAddress,
        phone: locPhone,
        professionalIds: professionals.map((p) => p.id),
        serviceIds: services.map((s) => s.id),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      setFeedback({ type: 'success', text: 'Nova unidade cadastrada com sucesso!' });
      setLocName('');
      setLocAddress('');
      setLocPhone('');
      loadModuleData();
    } else {
      setFeedback({ type: 'error', text: json.error || 'Erro ao cadastrar unidade.' });
    }
  };

  const tabs: Array<{ id: ModuleTab; label: string; icon: any; adminOnly?: boolean }> = [
    { id: 'waitlist', label: 'Lista de Espera', icon: Clock },
    { id: 'loyalty', label: 'Fidelidade', icon: Award },
    { id: 'coupons', label: 'Cupons', icon: Tag },
    { id: 'packages', label: 'Pacotes', icon: Package },
    { id: 'giftcards', label: 'Cartões-Presente', icon: Gift },
    { id: 'reviews', label: 'Avaliações', icon: Star },
    { id: 'campaigns', label: 'Campanhas', icon: Megaphone, adminOnly: true },
    { id: 'inventory', label: 'Estoque', icon: Boxes },
    { id: 'locations', label: 'Unidades', icon: MapPin },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 bg-white p-3 rounded-2xl border border-stone-200">
        {tabs
          .filter((t) => !t.adminOnly || canManage)
          .map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                  active
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-xs font-bold underline ml-4">
            Fechar
          </button>
        </div>
      )}

      {/* 1. WAITLIST */}
      {activeTab === 'waitlist' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleCreateWaitlist}
            className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4 h-fit"
          >
            <h3 className="font-bold text-sm text-stone-900">
              Incluir Cliente na Lista de Espera
            </h3>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Cliente</label>
              <select
                value={wlClientId}
                onChange={(e) => setWlClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Serviço Desejado
              </label>
              <select
                value={wlServiceId}
                onChange={(e) => setWlServiceId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Profissional (Opcional)
              </label>
              <select
                value={wlProfId}
                onChange={(e) => setWlProfId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              >
                <option value="">Qualquer profissional habilitada</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Data Desejada
                </label>
                <input
                  type="date"
                  value={wlDate}
                  onChange={(e) => setWlDate(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Período</label>
                <select
                  value={wlPeriod}
                  onChange={(e) => setWlPeriod(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-stone-300 text-xs"
                >
                  <option value="ANY">Qualquer horário</option>
                  <option value="MORNING">Manhã</option>
                  <option value="AFTERNOON">Tarde</option>
                  <option value="EVENING">Noite</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold"
            >
              Registrar na Lista de Espera
            </button>
          </form>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-sm text-stone-900">
                Solicitações na Lista de Espera ({waitlist.length})
              </h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-500">Horário para ofertar vaga:</span>
                <input
                  type="datetime-local"
                  value={offerSlotDateTime}
                  onChange={(e) => setOfferSlotDateTime(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-stone-300 text-xs"
                />
              </div>
            </div>
            {waitlist.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">
                Nenhuma cliente aguardando na lista de espera.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {waitlist.map((w) => (
                  <div
                    key={w.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-stone-900">{w.clientName}</span>
                        <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-800 text-[11px] font-semibold">
                          {w.status}
                        </span>
                        {w.position && (
                          <span className="text-xs font-bold text-rose-600">
                            #{w.position} na fila
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-600 mt-0.5">
                        {w.serviceName} • {w.professionalName} • Data desejada: {w.desiredDate} (
                        {w.preferredPeriod})
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {w.status === 'WAITING' && (
                        <button
                          onClick={() => handleOfferWaitlistSlot(w)}
                          className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                        >
                          Ofertar Vaga
                        </button>
                      )}
                      {w.status === 'OFFERED' &&
                        w.offers?.some((o: any) => o.status === 'PENDING') && (
                          <button
                            onClick={() => {
                              const pendingOff = w.offers.find((o: any) => o.status === 'PENDING');
                              if (pendingOff) handleAcceptWaitlistOffer(pendingOff.id);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                          >
                            Confirmar Reserva da Oferta
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. LOYALTY */}
      {activeTab === 'loyalty' && loyaltyData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {canManage && (
              <form
                onSubmit={handleCreateReward}
                className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4"
              >
                <h3 className="font-bold text-sm text-stone-900">
                  Cadastrar Recompensa de Fidelidade
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Nome da recompensa"
                    value={rewName}
                    onChange={(e) => setRewName(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                  <input
                    type="number"
                    required
                    min={10}
                    placeholder="Pontos necessários"
                    value={rewPoints}
                    onChange={(e) => setRewPoints(Number(e.target.value))}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Valor desconto (R$)"
                    value={rewDiscountReais}
                    onChange={(e) => setRewDiscountReais(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold"
                >
                  Adicionar Recompensa
                </button>
              </form>
            )}

            {canManage && (
              <form
                onSubmit={handleManualLoyaltyAdjust}
                className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4"
              >
                <h3 className="font-bold text-sm text-stone-900">
                  Ajuste Manual de Pontos (Com Auditoria)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={adjClientId}
                    onChange={(e) => setAdjClientId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={adjPoints}
                    onChange={(e) => setAdjPoints(Number(e.target.value))}
                    placeholder="Pontos (+/-)"
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Justificativa obrigatória para auditoria..."
                  value={adjJustification}
                  onChange={(e) => setAdjJustification(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold"
                >
                  Registrar Ajuste
                </button>
              </form>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 border-b border-stone-200">
              <h3 className="font-bold text-sm text-stone-900">
                Saldos de Fidelidade das Clientes (Baseados em Pagamentos Confirmados)
              </h3>
            </div>
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-stone-100">
              {(loyaltyData.clientBalances || []).map((cb: any) => (
                <div key={cb.clientId} className="p-4 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-bold text-stone-900 text-sm">{cb.clientName}</div>
                    <div className="text-stone-500 mt-0.5">
                      <span className="text-emerald-700 font-medium">+{cb.earnedTotal} pts</span> •{' '}
                      <span>-{cb.redeemedTotal} pts</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-semibold text-stone-400 block">Disponível</span>
                    <span className="font-bold text-sm text-rose-600">{cb.balance} pts</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                  <tr>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Pontos Acumulados</th>
                    <th className="py-3 px-4">Pontos Resgatados</th>
                    <th className="py-3 px-4">Saldo Disponível</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(loyaltyData.clientBalances || []).map((cb: any) => (
                    <tr key={cb.clientId}>
                      <td className="py-3 px-4 font-semibold">{cb.clientName}</td>
                      <td className="py-3 px-4 text-emerald-700 font-medium">+{cb.earnedTotal} pts</td>
                      <td className="py-3 px-4 text-stone-600">-{cb.redeemedTotal} pts</td>
                      <td className="py-3 px-4 font-bold text-rose-600">{cb.balance} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. COUPONS */}
      {activeTab === 'coupons' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateCoupon}
              className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4 h-fit"
            >
              <h3 className="font-bold text-sm text-stone-900">Novo Cupom Promocional</h3>
              <input
                type="text"
                required
                placeholder="Código (ex.: VERAO20)"
                value={cpnCode}
                onChange={(e) => setCpnCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono uppercase"
              />
              <input
                type="text"
                required
                placeholder="Nome da promoção"
                value={cpnName}
                onChange={(e) => setCpnName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={cpnType}
                  onChange={(e) => setCpnType(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                >
                  <option value="PERCENTAGE">Percentual (%)</option>
                  <option value="FIXED_CENTS">Valor Fixo (R$)</option>
                </select>
                <input
                  type="number"
                  required
                  min={1}
                  value={cpnValue}
                  onChange={(e) => setCpnValue(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-stone-600 mb-1">Compra Mín. (R$)</label>
                  <input
                    type="number"
                    min={0}
                    value={cpnMinReais}
                    onChange={(e) => setCpnMinReais(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-600 mb-1">Limite Total Usos</label>
                  <input
                    type="number"
                    min={1}
                    value={cpnMaxUses}
                    onChange={(e) => setCpnMaxUses(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={cpnFirstOnly}
                  onChange={(e) => setCpnFirstOnly(e.target.checked)}
                />
                <span>Válido apenas para 1ª compra da cliente</span>
              </label>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold"
              >
                Salvar Cupom
              </button>
            </form>
          )}

          <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 border-b border-stone-200">
              <h3 className="font-bold text-sm text-stone-900">
                Cupons Cadastrados ({coupons.length})
              </h3>
            </div>
            <div className="divide-y divide-stone-100">
              {coupons.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-mono font-bold text-xs border border-rose-200">
                        {c.code}
                      </span>
                      <span className="font-semibold text-sm text-stone-900">{c.name}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      Desconto:{' '}
                      {c.discountType === 'PERCENTAGE'
                        ? `${c.discountValue}%`
                        : formatBRL(c.discountValue)}{' '}
                      • Mínimo: {formatBRL(c.minPurchaseCents)} • Utilizações: {c.usedCount || 0}/
                      {c.maxTotalUses || '∞'}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {c.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. PACKAGES */}
      {activeTab === 'packages' && (
        <div className="space-y-6">
          {canManage && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form
                onSubmit={handleCreatePackage}
                className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4"
              >
                <h3 className="font-bold text-sm text-stone-900">
                  Criar Pacote no Catálogo
                </h3>
                <input
                  type="text"
                  required
                  placeholder="Nome do pacote (ex.: Combo 4 Manutenções)"
                  value={pkgName}
                  onChange={(e) => setPkgName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    value={pkgServiceId}
                    onChange={(e) => setPkgServiceId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={pkgQty}
                    onChange={(e) => setPkgQty(Number(e.target.value))}
                    placeholder="Sessões"
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                  <input
                    type="number"
                    min={1}
                    value={pkgPriceReais}
                    onChange={(e) => setPkgPriceReais(e.target.value)}
                    placeholder="Preço total (R$)"
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold"
                >
                  Salvar Pacote
                </button>
              </form>

              <form
                onSubmit={handlePurchasePackage}
                className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4"
              >
                <h3 className="font-bold text-sm text-stone-900">
                  Vender Pacote para Cliente
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={buyPkgId}
                    onChange={(e) => setBuyPkgId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  >
                    {(packagesData.catalog || []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatBRL(p.totalPriceCents)})
                      </option>
                    ))}
                  </select>
                  <select
                    value={buyClientId}
                    onChange={(e) => setBuyClientId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={buyConfirmed}
                    onChange={(e) => setBuyConfirmed(e.target.checked)}
                  />
                  <span>Pagamento já confirmado (libera utilização imediata das sessões)</span>
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold"
                >
                  Registrar Venda de Pacote
                </button>
              </form>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 border-b border-stone-200">
              <h3 className="font-bold text-sm text-stone-900">
                Pacotes Adquiridos pelas Clientes ({packagesData.customerPackages?.length || 0})
              </h3>
            </div>
            <div className="divide-y divide-stone-100">
              {(packagesData.customerPackages || []).map((cp: any) => (
                <div
                  key={cp.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-stone-900">{cp.clientName}</span>
                      <span className="text-xs text-stone-600">— {cp.packageName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          cp.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {cp.status}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 mt-1">
                      {(cp.remainingItems || []).map((it: any) => (
                        <span key={it.serviceId} className="mr-3">
                          Restantes: <strong>{it.remainingCredits}</strong>/{it.totalCredits} sessões
                        </span>
                      ))}
                    </div>
                  </div>
                  {cp.status === 'ACTIVE' && cp.remainingItems?.[0]?.remainingCredits > 0 && (
                    <button
                      onClick={() =>
                        handleConsumePackageSlot(cp.id, cp.remainingItems[0].serviceId)
                      }
                      className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold"
                    >
                      Consumir 1 Sessão
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. GIFT CARDS */}
      {activeTab === 'giftcards' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateGiftCard}
              className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4 h-fit"
            >
              <h3 className="font-bold text-sm text-stone-900">Emitir Cartão-Presente Digital</h3>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Valor Inicial (R$)
                </label>
                <input
                  type="number"
                  min={10}
                  required
                  value={gcAmountReais}
                  onChange={(e) => setGcAmountReais(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
              <input
                type="text"
                placeholder="Nome da presenteada (opcional)"
                value={gcRecipient}
                onChange={(e) => setGcRecipient(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
              <textarea
                rows={2}
                placeholder="Mensagem especial (opcional)"
                value={gcMessage}
                onChange={(e) => setGcMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={gcConfirmed}
                  onChange={(e) => setGcConfirmed(e.target.checked)}
                />
                <span>Pagamento confirmado (ativar saldo imediatamente)</span>
              </label>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold"
              >
                Gerar Código Seguro
              </button>
            </form>
          )}

          <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 border-b border-stone-200">
              <h3 className="font-bold text-sm text-stone-900">
                Cartões-Presente Emitidos ({giftCardsData.cards?.length || 0})
              </h3>
            </div>
            <div className="divide-y divide-stone-100">
              {(giftCardsData.cards || []).map((g: any) => (
                <div key={g.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs px-2.5 py-1 rounded bg-stone-900 text-white">
                        {g.code}
                      </span>
                      <span className="font-semibold text-sm text-stone-900">
                        Saldo: {formatBRL(g.currentBalanceCents)} / {formatBRL(g.initialBalanceCents)}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      Presenteada: {g.recipientName || 'Não informada'} • Status: {g.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. REVIEWS */}
      {activeTab === 'reviews' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200">
              <p className="text-xs text-stone-500">Nota Média Geral</p>
              <p className="text-3xl font-bold text-amber-500 mt-1">
                ★ {reviewsData.averageRating} / 5.0
              </p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200">
              <p className="text-xs text-stone-500">Total de Avaliações Reais</p>
              <p className="text-3xl font-bold text-stone-900 mt-1">{reviewsData.totalReviews}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200">
              <p className="text-xs text-stone-500">Regra de Integridade</p>
              <p className="text-xs text-stone-700 mt-1">
                Somente atendimentos CONCLUÍDOS podem ser avaliados (1 avaliação por atendimento). A nota original da cliente é imutável.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {(reviewsData.reviews || []).map((r: any) => (
              <div key={r.id} className="p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-stone-900">{r.clientName}</span>
                    <span className="text-xs text-stone-500 ml-2">
                      • {r.serviceName} com {r.professionalName}
                    </span>
                  </div>
                  <span className="text-amber-500 font-bold text-sm">
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)}
                  </span>
                </div>
                <p className="text-sm text-stone-700">{r.comment}</p>
                {r.replyText && (
                  <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-700">
                    <strong>Resposta do Estabelecimento:</strong> {r.replyText}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. CAMPAIGNS */}
      {activeTab === 'campaigns' && canManage && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleCreateCampaign}
            className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4 h-fit"
          >
            <h3 className="font-bold text-sm text-stone-900">
              Nova Campanha Promocional (WhatsApp Oficial)
            </h3>
            <input
              type="text"
              required
              placeholder="Nome da campanha"
              value={cmpName}
              onChange={(e) => setCmpName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
            />
            <select
              value={cmpSegment}
              onChange={(e) => setCmpSegment(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
            >
              <option value="PROMOTIONAL_OPT_IN">
                Todas as clientes com consentimento promocional
              </option>
              <option value="INACTIVE_DAYS">Clientes sem agendamento recente</option>
              <option value="PACKAGE_NEAR_END">Clientes com pacote próximo do fim</option>
            </select>
            <input
              type="text"
              placeholder="Cupom vinculado (opcional, ex.: BEMVINDA10)"
              value={cmpCoupon}
              onChange={(e) => setCmpCoupon(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono"
            />
            <textarea
              rows={3}
              required
              value={cmpMessage}
              onChange={(e) => setCmpMessage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
            />

            {campaignsData.preview && (
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1">
                <div>
                  Clientes no segmento: <strong>{campaignsData.preview.totalInSegment}</strong>
                </div>
                <div className="text-emerald-700 font-semibold">
                  Elegíveis com Opt-in Promocional:{' '}
                  {campaignsData.preview.eligibleWithMarketingConsentCount}
                </div>
                <div className="text-rose-600">
                  Bloqueadas por falta de consentimento:{' '}
                  {campaignsData.preview.blockedWithoutConsentCount}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold"
            >
              Salvar Prévia da Campanha
            </button>
          </form>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 border-b border-stone-200">
              <h3 className="font-bold text-sm text-stone-900">
                Campanhas Registradas ({campaignsData.campaigns?.length || 0})
              </h3>
            </div>
            <div className="divide-y divide-stone-100">
              {(campaignsData.campaigns || []).map((c: any) => (
                <div
                  key={c.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-stone-900">{c.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[11px] font-bold">
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 mt-1">{c.messagePreview}</p>
                    <p className="text-[11px] text-stone-500 mt-1">
                      Enviadas: {c.sentCount || 0} • Ignoradas sem consentimento:{' '}
                      {c.skippedNoConsentCount || 0} • Falhas: {c.failedCount || 0}
                    </p>
                  </div>
                  {c.status === 'DRAFT' && (
                    <button
                      onClick={() => handleDispatchCampaign(c.id)}
                      className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shrink-0"
                    >
                      Confirmar e Disparar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 8. INVENTORY */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {(inventoryData.alerts?.belowMinStock?.length > 0 ||
            inventoryData.alerts?.outOfStock?.length > 0) && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <strong>Alerta de Reposição de Estoque:</strong>{' '}
                {inventoryData.alerts.belowMinStock.length} produto(s) abaixo do estoque mínimo e{' '}
                {inventoryData.alerts.outOfStock.length} sem saldo.
              </div>
            </div>
          )}

          {canManage && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form
                onSubmit={handleCreateProduct}
                className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3"
              >
                <h3 className="font-bold text-sm text-stone-900">Cadastrar Produto / Insumo</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Nome do produto"
                    value={prdName}
                    onChange={(e) => setPrdName(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="SKU / Código"
                    value={prdSku}
                    onChange={(e) => setPrdSku(e.target.value.toUpperCase())}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="number"
                    min={0}
                    value={prdQty}
                    onChange={(e) => setPrdQty(Number(e.target.value))}
                    placeholder="Qtd atual"
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    value={prdMinQty}
                    onChange={(e) => setPrdMinQty(Number(e.target.value))}
                    placeholder="Estoque mín."
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    value={prdCostReais}
                    onChange={(e) => setPrdCostReais(e.target.value)}
                    placeholder="Custo unit. (R$)"
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold"
                >
                  Adicionar Produto
                </button>
              </form>

              <form
                onSubmit={handleRecordInventoryMovement}
                className="bg-white p-5 rounded-2xl border border-stone-200 space-y-3"
              >
                <h3 className="font-bold text-sm text-stone-900">
                  Registrar Movimentação / Ajuste Justificado
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    value={movPrdId}
                    onChange={(e) => setMovPrdId(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  >
                    {(inventoryData.products || []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Saldo: {p.currentQuantity})
                      </option>
                    ))}
                  </select>
                  <select
                    value={movType}
                    onChange={(e) => setMovType(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  >
                    <option value="IN">Entrada (+)</option>
                    <option value="MANUAL_OUT">Saída Manual (-)</option>
                    <option value="ADJUSTMENT">Ajuste de Inventário</option>
                    <option value="LOSS">Perda / Descarte (-)</option>
                  </select>
                  <input
                    type="number"
                    required
                    value={movDelta}
                    onChange={(e) => setMovDelta(Number(e.target.value))}
                    className="px-3 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Motivo / justificativa obrigatória..."
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold"
                >
                  Confirmar Movimentação
                </button>
              </form>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-stone-100">
              {(inventoryData.products || []).map((p: any) => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-bold text-stone-900 text-sm">{p.name}</div>
                    <div className="text-stone-500 mt-0.5">
                      <span className="font-mono">{p.sku}</span> • Custo: {formatBRL(p.unitCostCents)} • Mín: {p.minQuantity}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase font-semibold text-stone-400 block">Saldo</span>
                    <span
                      className={`font-bold text-sm ${
                        p.currentQuantity < p.minQuantity ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {p.currentQuantity} {p.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                  <tr>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Produto</th>
                    <th className="py-3 px-4">Saldo Atual</th>
                    <th className="py-3 px-4">Mínimo</th>
                    <th className="py-3 px-4">Custo Unitário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(inventoryData.products || []).map((p: any) => (
                    <tr key={p.id}>
                      <td className="py-3 px-4 font-mono">{p.sku}</td>
                      <td className="py-3 px-4 font-semibold">{p.name}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-bold ${
                            p.currentQuantity < p.minQuantity ? 'text-rose-600' : 'text-emerald-700'
                          }`}
                        >
                          {p.currentQuantity} {p.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4">{p.minQuantity}</td>
                      <td className="py-3 px-4">{formatBRL(p.unitCostCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 9. LOCATIONS */}
      {activeTab === 'locations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateLocation}
              className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4 h-fit"
            >
              <h3 className="font-bold text-sm text-stone-900">Cadastrar Nova Unidade</h3>
              <input
                type="text"
                required
                placeholder="Nome da unidade (ex.: Filial Moema)"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
              <input
                type="text"
                placeholder="Endereço completo"
                value={locAddress}
                onChange={(e) => setLocAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
              <input
                type="text"
                placeholder="Telefone"
                value={locPhone}
                onChange={(e) => setLocPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold"
              >
                Salvar Unidade
              </button>
            </form>
          )}

          <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {locations.map((l) => (
              <div key={l.id} className="p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-stone-900">{l.name}</span>
                    {l.isMain && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold">
                        Matriz Principal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    {l.address || 'Endereço padrão'} • Horário: {l.openTime} às {l.closeTime} ({l.timezone})
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                  Ativa
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
