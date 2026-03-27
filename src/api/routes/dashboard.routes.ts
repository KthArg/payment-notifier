import express, { Request, Response } from 'express';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { NotificationLogRepository } from '../../database/repositories/notification-log.repository';
import { WhatsAppService } from '../../services/whatsapp.service';
import { logger } from '../../utils/logger';

const router = express.Router();
const transactionRepo = new TransactionRepository();
const userRepo = new UserRepository();
const notificationLogRepo = new NotificationLogRepository();
const whatsappService = new WhatsAppService();

// ── GET /dashboard/transaction/:id ────────────────────────────────────────────
// Renders a mobile-friendly HTML page to register a sender's phone and send them
// a WhatsApp payment confirmation.
router.get('/transaction/:id', async (req: Request<{ id: string }>, res: Response) => {
  const tx = await transactionRepo.findById(req.params.id);
  if (!tx) {
    res.status(404).send('<h1 style="font-family:sans-serif;padding:24px">Transacción no encontrada</h1>');
    return;
  }

  const formattedAmount = `${tx.currency === 'CRC' ? '₡' : '$'}${tx.amount.toLocaleString('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const txDate = tx.transactionDate instanceof Date ? tx.transactionDate : new Date(tx.transactionDate);
  const formattedDate = txDate.toLocaleString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).replace(',', '');

  const senderDisplay = tx.senderName ?? 'Desconocido';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmar SINPE · ${senderDisplay}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
    .card{background:white;border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,.1)}
    .badge{display:inline-block;background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:16px}
    h1{font-size:20px;color:#1a1a2e;margin-bottom:4px}
    .subtitle{color:#666;font-size:14px;margin-bottom:20px;line-height:1.5}
    .info-grid{background:#f8f9fa;border-radius:12px;padding:16px;margin-bottom:24px}
    .info-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0}
    .info-row:not(:last-child){border-bottom:1px solid #e9ecef}
    .info-label{color:#888;font-size:13px}
    .info-value{color:#1a1a2e;font-size:14px;font-weight:500;text-align:right;max-width:60%}
    .amount{color:#2e7d32;font-size:20px;font-weight:700}
    .ref{font-size:11px;color:#aaa;word-break:break-all}
    hr{border:none;border-top:1px solid #e9ecef;margin:20px 0}
    h2{font-size:16px;color:#1a1a2e;margin-bottom:4px}
    .hint{color:#888;font-size:13px;margin-bottom:16px;line-height:1.5}
    label{display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:6px}
    input{width:100%;border:1.5px solid #ddd;border-radius:10px;padding:12px 14px;font-size:16px;transition:border-color .2s;outline:none;margin-bottom:12px}
    input:focus{border-color:#25D366}
    .btn{width:100%;background:#25D366;color:white;border:none;border-radius:10px;padding:14px;font-size:16px;font-weight:600;cursor:pointer;transition:background .2s}
    .btn:hover{background:#1ebe57}
    .btn:disabled{background:#a5d6a7;cursor:not-allowed}
    .result{display:none;border-radius:10px;padding:14px;text-align:center;font-size:14px;margin-top:12px;line-height:1.5}
    .result.success{background:#e8f5e9;color:#2e7d32}
    .result.error{background:#ffebee;color:#c62828}
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">SINPE Móvil · ${tx.bankName}</span>
    <h1>Pago sin confirmación</h1>
    <p class="subtitle">Este pago no se pudo confirmar automáticamente porque el correo no incluía el teléfono del remitente.</p>

    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Remitente</span>
        <span class="info-value">${senderDisplay}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Monto</span>
        <span class="info-value amount">${formattedAmount}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Fecha</span>
        <span class="info-value">${formattedDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Referencia</span>
        <span class="info-value ref">${tx.transactionId}</span>
      </div>
    </div>

    <hr>
    <h2>Registrar número del remitente</h2>
    <p class="hint">Ingresa el número de WhatsApp del remitente para enviarle la confirmación de pago y guardarlo para futuros pagos automáticos.</p>

    <form id="frm">
      <label for="phone">Número de WhatsApp *</label>
      <input type="tel" id="phone" placeholder="Ej: 8765-4321" required autocomplete="tel">
      <label for="name">Nombre (opcional)</label>
      <input type="text" id="name" placeholder="${senderDisplay}" autocomplete="name">
      <button type="submit" class="btn" id="btn">Enviar confirmación por WhatsApp</button>
    </form>
    <div class="result" id="result"></div>
  </div>

  <script>
    document.getElementById('frm').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('btn');
      const result = document.getElementById('result');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      result.style.display = 'none';
      try {
        const nameVal = document.getElementById('name').value.trim();
        const res = await fetch(window.location.pathname + '/register-sender', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            phone: document.getElementById('phone').value.trim(),
            name: nameVal || undefined,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          result.className = 'result success';
          result.textContent = '✓ Confirmación enviada por WhatsApp correctamente';
          document.getElementById('frm').style.display = 'none';
        } else {
          result.className = 'result error';
          result.textContent = data.message ?? 'Error al enviar. Intente de nuevo.';
          btn.disabled = false;
          btn.textContent = 'Enviar confirmación por WhatsApp';
        }
      } catch {
        result.className = 'result error';
        result.textContent = 'Error de conexión. Intente de nuevo.';
        btn.disabled = false;
        btn.textContent = 'Enviar confirmación por WhatsApp';
      }
      result.style.display = 'block';
    });
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ── POST /dashboard/transaction/:id/register-sender ──────────────────────────
// Saves the sender's phone + triggers WhatsApp confirmation to them.
router.post('/transaction/:id/register-sender', async (req: Request<{ id: string }>, res: Response) => {
  const { phone, name } = req.body as { phone?: string; name?: string };

  if (!phone) {
    res.status(400).json({ error: 'Bad Request', message: 'El teléfono es requerido' });
    return;
  }

  const tx = await transactionRepo.findById(req.params.id);
  if (!tx) {
    res.status(404).json({ error: 'Not Found', message: 'Transacción no encontrada' });
    return;
  }

  try {
    await userRepo.upsertFromSinpe(phone, name ?? tx.senderName ?? undefined);

    const formattedAmount = `${tx.currency === 'CRC' ? '₡' : '$'}${tx.amount.toLocaleString('es-CR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const txDate = tx.transactionDate instanceof Date ? tx.transactionDate : new Date(tx.transactionDate);
    const formattedDate = txDate.toLocaleString('es-CR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', '');

    const messageId = await whatsappService.sendNotification({
      phoneNumber: phone,
      templateName: 'sinpe_recibido',
      templateData: {
        recipientName: name ?? tx.senderName ?? 'Cliente',
        amount: formattedAmount,
        senderName: tx.senderName ?? 'Desconocido',
        bankName: tx.bankName,
        date: formattedDate,
        reference: tx.transactionId,
      },
    });

    await notificationLogRepo.create({
      transactionId: tx.id,
      userId: tx.userId,
      whatsappMessageId: messageId ?? undefined,
      phoneNumber: phone,
      templateName: 'sinpe_recibido',
    });

    logger.info('Dashboard: sender registered and notified', {
      txId: tx.id,
      messageSent: !!messageId,
    });

    res.json({ success: true, messageId });
  } catch (err: any) {
    logger.error('Dashboard: register-sender failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error', message: 'No se pudo enviar la notificación' });
  }
});

export default router;
