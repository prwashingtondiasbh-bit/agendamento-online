import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const timestamp = new Date().toISOString();

  if (err instanceof ZodError) {
    console.warn(`[${timestamp}] [WARN] ${req.method} ${req.originalUrl} Zod Validation:`, err.issues[0]?.message);
    return res.status(400).json({
      success: false,
      error: err.issues[0]?.message || 'Erro de validação nos dados enviados',
      details: err.issues.map((e: any) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Determine appropriate HTTP status code
  let statusCode = err.statusCode || err.status;

  if (!statusCode) {
    const msg = String(err.message || '');
    if (
      msg.includes('Horário indisponível') ||
      msg.includes('conflito') ||
      msg.includes('não encontrado') ||
      msg.includes('já está em uso') ||
      msg.includes('inválido') ||
      msg.includes('incorreta') ||
      msg.includes('não pertence') ||
      msg.includes('obrigatório')
    ) {
      statusCode = 400;
    } else {
      statusCode = 500;
    }
  }

  // Log 500s as [ERROR] and 4xx as [WARN]
  if (statusCode >= 500) {
    console.error(`[${timestamp}] [ERROR] ${req.method} ${req.originalUrl}:`, err.message || err);
  } else {
    console.warn(`[${timestamp}] [WARN] ${req.method} ${req.originalUrl}:`, err.message || 'Requisição inválida');
  }

  const responseMessage = statusCode === 500 ? 'Erro interno no servidor' : (err.message || 'Erro no processamento da requisição');

  return res.status(statusCode).json({
    success: false,
    error: responseMessage,
    ...(err.code ? { code: err.code } : {}),
    ...(err.conflicts ? { conflicts: err.conflicts } : {}),
    ...(err.existingClient ? { existingClient: err.existingClient } : {}),
    ...(err.suggestedSlots ? { suggestedSlots: err.suggestedSlots } : {}),
  });
}
