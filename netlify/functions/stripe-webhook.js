const Stripe = require("stripe");
const nodemailer = require("nodemailer");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return response(405, "Method not allowed");
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("Missing Stripe webhook configuration.");
    return response(500, "Webhook configuration missing");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  let stripeEvent;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature verification failed:", err.message);
    return response(400, "Invalid Stripe signature");
  }

  if (stripeEvent.type !== "checkout.session.completed") return response(200, "Event ignored");
  const session = stripeEvent.data.object;
  if (session.payment_status !== "paid") return response(200, "Payment not paid; email skipped");

  const email = session.customer_details && session.customer_details.email;
  if (!email) {
    console.error("Paid session without customer email:", session.id);
    return response(200, "No customer email");
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("Missing Gmail SMTP variables.");
    return response(500, "Email configuration missing");
  }

  try {
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    const listText = items.data.map(x => `- ${x.description || "Article"} × ${x.quantity || 1}`).join("\\n");
    const listHtml = items.data.map(x => `<li>${escapeHtml(x.description || "Article")} × ${x.quantity || 1}</li>`).join("");
    const total = ((session.amount_total || 0) / 100).toFixed(2).replace(".", ",");
    const ref = session.id.slice(-8).toUpperCase();
    const mailer = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    await mailer.sendMail({
      from: `"Les Mains d’Émeraude" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Confirmation de votre commande ${ref} — Les Mains d’Émeraude`,
      text: `Bonjour,\\n\\nMerci pour votre commande chez Les Mains d’Émeraude !\\n\\nCommande : ${ref}\\n${listText}\\n\\nTotal payé : ${total} €\\nVotre paiement a bien été confirmé.\\n\\nÀ bientôt,\\nLes Mains d’Émeraude`,
      html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:auto"><h2>Merci pour votre commande !</h2><p>Votre paiement auprès de <strong>Les Mains d’Émeraude</strong> est confirmé.</p><p><strong>Commande :</strong> ${escapeHtml(ref)}</p><ul>${listHtml}</ul><p><strong>Total payé : ${total} €</strong></p><p>À bientôt,<br>Les Mains d’Émeraude</p></div>`
    });
    return response(200, "Confirmation email sent");
  } catch (err) {
    console.error("Email sending failed:", err.message);
    return response(500, "Email sending failed");
  }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function response(statusCode, body) {
  return { statusCode, headers: { "Content-Type":"text/plain; charset=utf-8", "Cache-Control":"no-store" }, body };
}
