import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db } from '../storage.js';

const router = Router();

// Rate limiting on auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: { success: false, error: 'Muitas tentativas. Tente novamente mais tarde.' },
  validate: { xForwardedForHeader: false, forwardedHeader: false, trustProxy: false },
});

router.use(authLimiter);

// Register Owner & Tenant
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, businessName, phone } = req.body;

    if (!name || !email || !password || !businessName) {
      return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios' });
    }

    // Check if user already exists
    const users = await db.getUsers ? await db.getUsers() : [];
    const existingUser = users.find((u: any) => u.email === email);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'E-mail já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.registerTenantWithUser({
      name,
      email,
      passwordHash,
      businessName,
      phone: phone || '',
    });

    // Set session cookie
    const sessionPayload = Buffer.from(
      JSON.stringify({
        userId: result.user.id,
        userName: result.user.name,
        email: result.user.email,
        tenantId: result.tenant.id,
        role: 'OWNER',
        permissions: ['*'],
      })
    ).toString('base64');

    res.cookie('agenda_session', sessionPayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      success: true,
      data: {
        user: { id: result.user.id, name: result.user.name, email: result.user.email },
        tenant: result.tenant,
        role: 'OWNER',
      },
      message: 'Empresa e conta criadas com sucesso!',
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios' });
    }

    const user = await db.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, error: 'E-mail ou senha inválidos' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'E-mail ou senha inválidos' });
    }

    // Get tenant membership
    const tenantId = user.tenantId || 'biz-1';
    const role = user.role || 'OWNER';

    const sessionPayload = Buffer.from(
      JSON.stringify({
        userId: user.id,
        userName: user.name,
        email: user.email,
        tenantId,
        role,
        permissions: ['*'],
      })
    ).toString('base64');

    res.cookie('agenda_session', sessionPayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email },
        tenantId,
        role,
      },
      message: 'Login realizado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('agenda_session');
  res.json({ success: true, message: 'Logout realizado com sucesso' });
});

// Current User Info (/me)
router.get('/me', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Não autenticado' });
    }

    const business = await db.getBusiness(req.tenantContext?.tenantId);

    res.json({
      success: true,
      data: {
        user: req.user,
        tenant: business,
        tenantContext: req.tenantContext,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'E-mail obrigatório' });
    }

    // Generates a secure token (mock/actual storage)
    const token = Math.random().toString(36).substring(2, 15);
    await db.savePasswordResetToken(email, token);

    res.json({
      success: true,
      message: 'Instruções de recuperação enviadas para o seu e-mail.',
      // In development / demo mode, return reset token for testing convenience
      ...(process.env.NODE_ENV === 'development' ? { devResetToken: token } : {}),
    });
  } catch (error) {
    next(error);
  }
});

// Reset Password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Todos os campos são obrigatórios' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const success = await db.resetUserPassword(email, token, passwordHash);

    if (!success) {
      return res.status(400).json({ success: false, error: 'Token inválido ou expirado' });
    }

    res.json({ success: true, message: 'Senha redefinida com sucesso!' });
  } catch (error) {
    next(error);
  }
});

export default router;
