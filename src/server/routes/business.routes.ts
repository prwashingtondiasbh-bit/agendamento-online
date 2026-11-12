import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, memoryStore } from '../storage.js';
import { businessSchema, cancellationPolicySchema } from '../validation/schemas.js';
import { cancellationService } from '../cancellationService.js';
import { requireRole } from '../middleware/auth.js';

import { saasService } from '../saasService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const requestedRef = String(
      req.query?.slug ||
        req.query?.tenantId ||
        req.headers?.['x-tenant-slug'] ||
        req.headers?.['x-tenant-id'] ||
        ''
    ).trim();
    let tenantId = req.tenantContext?.tenantId || 'biz-1';
    if (requestedRef) {
      const resolved = await saasService.resolvePublicEstablishmentBySlugOrId(requestedRef);
      if (resolved?.establishment?.id) {
        tenantId = resolved.establishment.id;
      }
    }
    const business = await db.getBusiness(tenantId);
    res.json({ success: true, data: business });
  } catch (error) {
    next(error);
  }
});

router.put('/', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = businessSchema.partial().parse(req.body);
    const updated = await db.updateBusiness(tenantId, validatedData);
    res.json({ success: true, data: updated, message: 'Dados da empresa atualizados com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.get('/cancellation-policy', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const policy = await cancellationService.getCancellationPolicy(tenantId);
    res.json({ success: true, data: policy });
  } catch (error) {
    next(error);
  }
});

router.put('/cancellation-policy', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const role = req.tenantContext?.role || 'OWNER';
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const userId = req.user?.id || 'admin';
    const validated = cancellationPolicySchema.parse(req.body);
    const updated = await cancellationService.updateCancellationPolicy(tenantId, userId, role, validated);
    res.json({
      success: true,
      data: updated,
      message: 'Política de cancelamento e reembolso atualizada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

// Listar membros da equipe (Proprietário, Gerentes, Recepcionistas e Profissionais)
router.get('/team-members', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const members = memoryStore.users
      .filter(
        (u: any) =>
          u.tenantId === tenantId &&
          u.role !== 'CUSTOMER' &&
          u.role !== 'SUPER_ADMIN' &&
          !u.isMasterAdmin &&
          String(u.email || '').toLowerCase() !== 'master@agendabeauty.com.br'
      )
      .map((u: any) => {
        const prof = u.professionalId
          ? memoryStore.professionals.find((p: any) => p.id === u.professionalId)
          : null;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          professionalId: u.professionalId || null,
          professionalName: prof?.name || null,
          active: u.active !== false,
        };
      });
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
});

// Cadastrar novo usuário da equipe (MANAGER, RECEPTIONIST ou PROFESSIONAL)
router.post('/team-members', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { name, email, password, role, professionalId, specialty, phone } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Nome, e-mail, senha e perfil (role) são obrigatórios.',
      });
    }

    if (!['MANAGER', 'RECEPTIONIST', 'PROFESSIONAL', 'OWNER'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Perfil inválido. Escolha MANAGER, RECEPTIONIST ou PROFESSIONAL.',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = memoryStore.users.find(
      (u: any) => String(u.email).toLowerCase() === normalizedEmail
    );
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Já existe um usuário cadastrado com este e-mail.',
      });
    }

    let linkedProfId = professionalId || undefined;
    // Se o perfil for PROFESSIONAL e não informou professionalId existente, cria também na agenda de profissionais
    if (role === 'PROFESSIONAL' && !linkedProfId) {
      const createdProf = await db.createProfessional(tenantId, {
        name: String(name).trim(),
        email: normalizedEmail,
        phone: phone || '',
        specialty: specialty || 'Especialista Beauty',
        active: true,
      });
      linkedProfId = createdProf.id;
    }

    const newUser = {
      id: `user-team-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: bcrypt.hashSync(String(password), 10),
      tenantId,
      role,
      professionalId: linkedProfId,
      resetToken: null,
      resetExpires: null,
      active: true,
    };

    memoryStore.users.push(newUser);

    await db.recordAuditLog(tenantId, req.user?.id || null, 'TEAM_MEMBER_CREATED', {
      memberId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      professionalId: linkedProfId,
    });

    res.status(201).json({
      success: true,
      data: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        professionalId: newUser.professionalId || null,
        active: true,
      },
      message: 'Membro da equipe cadastrado com sucesso!',
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/team-members/:id', requireRole(['OWNER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const memberId = req.params.id;
    const index = memoryStore.users.findIndex(
      (u: any) =>
        u.id === memberId &&
        u.tenantId === tenantId &&
        u.role !== 'SUPER_ADMIN' &&
        !u.isMasterAdmin &&
        String(u.email || '').toLowerCase() !== 'master@agendabeauty.com.br'
    );
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }
    if (memoryStore.users[index].id === req.user?.id) {
      return res.status(400).json({
        success: false,
        error: 'Você não pode remover sua própria conta de proprietário.',
      });
    }
    memoryStore.users.splice(index, 1);
    res.json({ success: true, message: 'Acesso do membro removido com sucesso.' });
  } catch (error) {
    next(error);
  }
});

router.post('/test-mercadopago', requireRole(['OWNER', 'MANAGER']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const business = await db.getBusiness(tenantId);
    const tokenToTest = String(req.body?.accessToken || business.mpAccessToken || process.env.MP_ACCESS_TOKEN || '').trim();
    const publicKeyToSave = req.body?.publicKey !== undefined ? String(req.body.publicKey || '').trim() : undefined;

    if (!tokenToTest) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Nenhum Access Token informado ou configurado.',
      });
    }

    // Detect if the user accidentally pasted a Public Key (UUID format APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) into the Access Token field
    if (/^(APP_USR|TEST)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenToTest)) {
      return res.status(400).json({
        success: false,
        ok: false,
        error:
          'Você informou a Public Key no campo de Access Token. Coloque a Public Key no campo "Public Key" e o Access Token longo no campo "Access Token".',
      });
    }

    // Official Mercado Pago user info endpoint is /users/me (without /v1 prefix)
    const mpResp = await fetch('https://api.mercadopago.com/users/me', {
      headers: {
        Authorization: `Bearer ${tokenToTest}`,
      },
    });

    if (!mpResp.ok) {
      const errText = await mpResp.text();
      let parsedErr: any = {};
      try {
        parsedErr = JSON.parse(errText);
      } catch (_) {}
      return res.status(400).json({
        success: false,
        ok: false,
        error: parsedErr.message || `Token rejeitado pelo Mercado Pago (HTTP ${mpResp.status})`,
      });
    }

    const mpUser: any = await mpResp.json();
    const isTestAccount =
      String(mpUser.nickname || '').toUpperCase().startsWith('TEST') ||
      String(mpUser.email || '').toLowerCase().includes('@testuser.com') ||
      tokenToTest.startsWith('TEST-');

    // Automatically persist the validated credentials so the establishment is ready immediately
    try {
      await db.updateBusiness(tenantId, {
        mpAccessToken: tokenToTest,
        ...(publicKeyToSave !== undefined ? { mpPublicKey: publicKeyToSave || null } : {}),
        mpEnvironment: isTestAccount ? 'sandbox' : (req.body?.environment || business.mpEnvironment || 'production'),
      });
    } catch (_) {}

    return res.json({
      success: true,
      ok: true,
      data: {
        id: mpUser.id,
        nickname: mpUser.nickname || mpUser.first_name || 'Conta Mercado Pago',
        email: mpUser.email || '',
        siteId: mpUser.site_id || mpUser.country_id || 'MLB',
        isTestAccount,
      },
      message: 'Conexão com Mercado Pago validada e salva com sucesso!',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      ok: false,
      error: `Erro ao conectar com a API do Mercado Pago: ${error.message || error}`,
    });
  }
});

export default router;

