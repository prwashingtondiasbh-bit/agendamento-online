import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getMySqlPool } from '../db/mysql.js';
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
    const pool = getMySqlPool();
    let members: any[] = [];

    if (pool) {
      try {
        const [rows]: any = await pool.query(
          `SELECT u.id, u.name, u.email, tm.role, u.active, p.id as professionalId, p.name as professionalName
           FROM TenantMember tm
           JOIN User u ON u.id = tm.userId
           LEFT JOIN Professional p ON p.email = u.email AND p.tenantId = tm.tenantId
           WHERE tm.tenantId = ? AND tm.role != 'SUPER_ADMIN' AND LOWER(u.email) != 'prwashingtondiasbh@gmail.com'
           ORDER BY u.name ASC`,
          [tenantId]
        );
        if (rows && rows.length > 0) {
          members = rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            role: r.role,
            professionalId: r.professionalId || null,
            professionalName: r.professionalName || null,
            active: Boolean(r.active),
          }));
        }
      } catch (mysqlErr) {
        console.warn('[MySQL Team Members GET Warning]:', mysqlErr);
      }
    }

    if (members.length === 0) {
      members = memoryStore.users
        .filter(
          (u: any) =>
            u.tenantId === tenantId &&
            u.role !== 'CUSTOMER' &&
            u.role !== 'SUPER_ADMIN' &&
            !u.isMasterAdmin &&
            String(u.email || '').toLowerCase() !== 'prwashingtondiasbh@gmail.com'
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
    }

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
    const userId = `user-team-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const passwordHash = bcrypt.hashSync(String(password), 10);

    const pool = getMySqlPool();
    if (pool) {
      try {
        // Check if user already exists
        const [existingUsers]: any = await pool.query(`SELECT id FROM User WHERE email = ?`, [normalizedEmail]);
        let targetUserId = userId;
        if (existingUsers && existingUsers.length > 0) {
          targetUserId = existingUsers[0].id;
        } else {
          await pool.query(
            `INSERT INTO User (id, name, email, passwordHash, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
            [userId, String(name).trim(), normalizedEmail, passwordHash]
          );
        }

        // Check if TenantMember already exists
        const [existingMember]: any = await pool.query(
          `SELECT id FROM TenantMember WHERE tenantId = ? AND userId = ?`,
          [tenantId, targetUserId]
        );
        if (existingMember && existingMember.length > 0) {
          return res.status(409).json({ success: false, error: 'Este usuário já faz parte da equipe deste estabelecimento.' });
        }

        const memberId = `tm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        await pool.query(
          `INSERT INTO TenantMember (id, tenantId, userId, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [memberId, tenantId, targetUserId, role]
        );

        let linkedProfId = professionalId || undefined;
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

        await db.recordAuditLog(tenantId, req.user?.id || null, 'TEAM_MEMBER_CREATED', {
          memberId: targetUserId,
          email: normalizedEmail,
          role,
          professionalId: linkedProfId,
        });

        return res.status(201).json({
          success: true,
          data: {
            id: targetUserId,
            name: String(name).trim(),
            email: normalizedEmail,
            role,
            professionalId: linkedProfId || null,
            active: true,
          },
          message: 'Membro da equipe cadastrado com sucesso!',
        });
      } catch (mysqlErr) {
        console.warn('[MySQL Team Member Create Warning]:', mysqlErr);
      }
    }

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
      id: userId,
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
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

    if (memberId === req.user?.id) {
      return res.status(400).json({
        success: false,
        error: 'Você não pode remover sua própria conta de proprietário.',
      });
    }

    const pool = getMySqlPool();
    if (pool) {
      try {
        // Verify membership belongs to tenant
        const [members]: any = await pool.query(
          `SELECT tm.*, u.email FROM TenantMember tm JOIN User u ON u.id = tm.userId WHERE tm.userId = ? AND tm.tenantId = ?`,
          [memberId, tenantId]
        );
        if (!members || members.length === 0) {
          return res.status(404).json({ success: false, error: 'Usuário não encontrado nesta empresa.' });
        }
        const memberUser = members[0];
        if (memberUser.email?.toLowerCase() === 'prwashingtondiasbh@gmail.com' || memberUser.role === 'SUPER_ADMIN') {
          return res.status(403).json({ success: false, error: 'Acesso negado para remover super admin.' });
        }

        await pool.query(`DELETE FROM TenantMember WHERE userId = ? AND tenantId = ?`, [memberId, tenantId]);
        // If user has no other tenant memberships, optionally delete user or keep user
      } catch (mysqlErr) {
        console.warn('[MySQL Team Member Delete Warning]:', mysqlErr);
      }
    }

    const index = memoryStore.users.findIndex(
      (u: any) =>
        u.id === memberId &&
        u.tenantId === tenantId &&
        u.role !== 'SUPER_ADMIN' &&
        !u.isMasterAdmin &&
        String(u.email || '').toLowerCase() !== 'prwashingtondiasbh@gmail.com'
    );
    if (index !== -1) {
      if (memoryStore.users[index].id === req.user?.id) {
        return res.status(400).json({
          success: false,
          error: 'Você não pode remover sua própria conta de proprietário.',
        });
      }
      memoryStore.users.splice(index, 1);
    }

    await db.recordAuditLog(tenantId, req.user?.id || null, 'TEAM_MEMBER_DELETED', { memberId });
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

