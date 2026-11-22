export const emailConfigurado = () => !!(process.env.BREVO_API_KEY && process.env.EMAIL_REMETENTE);

export async function enviarEmail(para, assunto, html) {
  if (!emailConfigurado()) return false;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_REMETENTE, name: process.env.EMAIL_NOME || 'Vocacional Hermanas Guanelianas' },
        to: [{ email: para }],
        subject: assunto,
        htmlContent: html,
      }),
    });
    if (!r.ok) console.error('email', r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error('email', e);
    return false;
  }
}
