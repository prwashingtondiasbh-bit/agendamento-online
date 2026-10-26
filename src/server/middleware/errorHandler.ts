import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] ${req.method} ${req.originalUrl}:`, err.message || err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Erro de validação nos dados enviados',
      details: err.issues.map((e: any) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode === 500 ? 'Erro interno no servidor' : (err.message || 'Erro desconhecido');

  return res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && statusCode === 500 ? { stack: err.stack } : {}),
  });
}
