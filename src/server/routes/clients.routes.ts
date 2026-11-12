import { Router } from 'express';
import { db } from '../storage.js';
import { clientSchema, clientNoteSchema, clientTagsSchema } from '../validation/schemas.js';
import { requireStaff, requireRole } from '../middleware/auth.js';

const router = Router();

// All client routes require staff access (CUSTOMER is strictly blocked)
router.use(requireStaff);

router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const role = req.tenantContext?.role;
    const hideInternalNotes = role === 'PROFESSIONAL';

    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const type = typeof req.query.type === 'string' && ['ALL', 'NEW', 'RECURRING'].includes(req.query.type)
      ? (req.query.type as 'ALL' | 'NEW' | 'RECURRING')
      : 'ALL';
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const result = await db.queryClients(tenantId, {
      search,
      type,
      tag,
      page,
      limit,
      hideInternalNotes,
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      availableTags: result.availableTags,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/profile', async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const role = req.tenantContext?.role;
    const hideInternalNotes = role === 'PROFESSIONAL';
    const { id } = req.params;

    const profile = await db.getClientProfile(tenantId, id, { hideInternalNotes });
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Cliente não encontrada neste estabelecimento',
      });
    }

    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireRole(['OWNER', 'MANAGER', 'RECEPTIONIST']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const validatedData = clientSchema.parse(req.body);
    const newClient = await db.createClient(tenantId, {
      name: validatedData.name,
      phone: validatedData.phone,
      email: validatedData.email || '',
      notes: validatedData.notes || '',
      preferences: validatedData.preferences || validatedData.notes || '',
      tags: validatedData.tags || [],
      communicationConsent: validatedData.communicationConsent,
      allowExistingReturn: validatedData.allowExistingReturn,
    });
    res.status(201).json({ success: true, data: newClient, message: 'Cliente cadastrada com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireRole(['OWNER', 'MANAGER', 'RECEPTIONIST']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    const validatedData = clientSchema.partial().parse(req.body);
    const updated = await db.updateClient(tenantId, id, validatedData, {
      id: req.user?.id || 'staff',
      name: req.user?.name || 'Equipe',
    });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrada neste estabelecimento' });
    }
    res.json({ success: true, data: updated, message: 'Cadastro da cliente atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/notes', requireRole(['OWNER', 'MANAGER', 'RECEPTIONIST']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    const validated = clientNoteSchema.parse(req.body);

    const result = await db.addClientInternalNote(tenantId, id, {
      content: validated.content,
      authorId: req.user?.id || 'staff',
      authorName: req.user?.name || 'Equipe',
    });

    res.status(201).json({
      success: true,
      data: result.note,
      client: result.client,
      message: 'Anotação interna registrada com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/tags', requireRole(['OWNER', 'MANAGER', 'RECEPTIONIST']), async (req, res, next) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'biz-1';
    const { id } = req.params;
    const validated = clientTagsSchema.parse(req.body);
    const updated = await db.updateClient(
      tenantId,
      id,
      { tags: validated.tags },
      { id: req.user?.id || 'staff', name: req.user?.name || 'Equipe' }
    );
    res.json({
      success: true,
      data: updated,
      message: 'Etiquetas da cliente atualizadas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
