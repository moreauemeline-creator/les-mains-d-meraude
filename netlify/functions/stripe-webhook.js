const Stripe = require("stripe");
const nodemailer = require("nodemailer");

const STOCK_STORE = "lme-unique-products";
const stockKey = (productId) => `catalogue:${productId}`;

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
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe signature verification failed:", err.message);
    return response(400, "Invalid Stripe signature");
  }

  const session = stripeEvent.data.object;
  if (!["checkout.session.completed", "checkout.session.expired"].includes(stripeEvent.type)) {
    return response(200, "Event ignored");
  }

  try {
    const { connectLambda, getStore } = await import("@netlify/blobs");
    connectLambda(event);
    const stock = getStore({ name: STOCK_STORE, region: "eu-central-1" });
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
      expand: ["data.price.product"]
    });
    const productIds = lineItems.data
      .map((line) => {
        const product = line.price && line.price.product && typeof line.price.product === "object" ? line.price.product : null;
        return product && product.metadata ? product.metadata.product_id : null;
      })
      .filter((id) => typeof id === "string" && /^(bracelets-\d{2}|colliers-\d{2}|bagues-\d{2}|boucles-doreilles-\d{2})$/.test(id));

    if (stripeEvent.type === "checkout.session.expired") {
      for (const productId of productIds) {
        const key = stockKey(productId);
        const current = await stock.get(key, { type: "text" });
        if (current === `reserved:${session.id}`) await stock.delete(key);
      }
      return response(200, "Expired checkout reservations released");
    }

    if (session.payment_status !== "paid") {
      return response(200, "Payment not paid; emails skipped");
    }

    // À paiement confirmé, le statut devient définitivement « vendu ».
    for (const productId of productIds) {
      const key = stockKey(productId);
      const current = await stock.getWithMetadata(key);
      if (!current) {
        const created = await stock.set(key, "sold", { onlyIfNew: true });
        if (!created.modified) throw new Error(`Conflit de stock lors de la vente de ${productId}`);
      } else if (current.data === `reserved:${session.id}`) {
        const updated = await stock.set(key, "sold", { onlyIfMatch: current.etag });
        if (!updated.modified) throw new Error(`Impossible de confirmer le statut vendu de ${productId}`);
      } else if (current.data !== "sold") {
        throw new Error(`Réservation de stock incohérente pour ${productId}`);
      }
    }
  } catch (stockError) {
    console.error("Unique-product stock update failed:", stockError.message);
    return response(500, "Unique-product stock update failed");
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("Missing Gmail SMTP variables.");
    return response(500, "Email configuration missing");
  }

  try {
    const [items] = await Promise.all([
      stripe.checkout.sessions.listLineItems(session.id, {
        limit: 100,
        expand: ["data.price.product"]
      })
    ]);

    const customer = session.customer_details || {};
    const shipping = session.shipping_details || {};
    const address = shipping.address || customer.address || {};
    const customerName = shipping.name || customer.name || "Non renseigné";
    const customerEmail = customer.email || session.customer_email || "";
    const customerPhone = customer.phone || session.shipping_details?.phone || "Non renseigné";
    const addressParts = [
      address.line1,
      address.line2,
      [address.postal_code, address.city].filter(Boolean).join(" "),
      address.state,
      address.country
    ].filter(Boolean);
    const fullAddress = addressParts.length ? addressParts.join("\n") : "Adresse non transmise par Stripe";
    const ref = session.id.slice(-8).toUpperCase();
    const orderNote = typeof session.metadata?.order_note === "string" ? session.metadata.order_note.trim().slice(0, 500) : "";
    const total = ((session.amount_total || 0) / 100).toFixed(2).replace(".", ",");
    // Le nom identifie le bijou ; la description Stripe contient la chaîne
    // choisie et les noms des charms pour les bijoux personnalisés.
    const getItemDetails = (item) => {
      const product = item.price && item.price.product && typeof item.price.product === "object"
        ? item.price.product
        : null;
      const name = item.description || (product && product.name) || "Article";
      const details = product && typeof product.description === "string"
        ? product.description.trim()
        : "";
      const genericDescription = "Bijou fait main — Les Mains d’Émeraude";
      return details && details !== genericDescription
        ? `${name} — ${details}`
        : name;
    };
    const itemLines = items.data.map(item =>
      `- ${getItemDetails(item)} × ${item.quantity || 1}`
    );
    const listText = itemLines.join("\n");
    const listHtml = items.data.map(item =>
      `<li>${escapeHtml(getItemDetails(item))} × ${item.quantity || 1}</li>`
    ).join("");

    const mailer = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    // E-mail de confirmation destiné au client.
    if (customerEmail) {
      await mailer.sendMail({
        from: `"Les Mains d’Émeraude" <${process.env.GMAIL_USER}>`,
        to: customerEmail,
        subject: `Confirmation de votre commande ${ref} — Les Mains d’Émeraude`,
        text: `Bonjour,\n\nMerci pour votre commande chez Les Mains d’Émeraude !\n\nCommande : ${ref}\n${listText}\n\nTotal payé : ${total} €\nVotre paiement a bien été confirmé.\n\nÀ bientôt,\nLes Mains d’Émeraude`,
        html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:auto"><h2>Merci pour votre commande !</h2><p>Votre paiement auprès de <strong>Les Mains d’Émeraude</strong> est confirmé.</p><p><strong>Commande :</strong> ${escapeHtml(ref)}</p><ul>${listHtml}</ul><p><strong>Total payé : ${total} €</strong></p><p>À bientôt,<br>Les Mains d’Émeraude</p></div>`
      });
    } else {
      console.warn("Paid session without customer email:", session.id);
    }

    // Notification détaillée destinée à la vendeuse.
    const sellerText = [
      "Nouvelle commande payée — Les Mains d’Émeraude",
      "",
      `Commande : ${ref}`,
      `Nom / prénom : ${customerName}`,
      `E-mail : ${customerEmail || "Non renseigné"}`,
      `Téléphone : ${customerPhone}`,
      "Adresse de livraison :",
      fullAddress,
      "",
      "Détail de la commande :",
      listText || "- Aucun article retourné par Stripe",
      "",
      "Demande particulière du client :",
      orderNote || "Aucune demande particulière.",
      "",
      `Total payé : ${total} €`,
      "",
      "Paiement confirmé par Stripe."
    ].join("\n");

    const sellerHtml = `
      <div style="font-family:Arial,sans-serif;color:#333;max-width:650px;margin:auto">
        <h2>Nouvelle commande payée !</h2>
        <p><strong>Commande :</strong> ${escapeHtml(ref)}</p>
        <h3>Coordonnées du client</h3>
        <p><strong>Nom / prénom :</strong> ${escapeHtml(customerName)}<br>
        <strong>E-mail :</strong> ${escapeHtml(customerEmail || "Non renseigné")}<br>
        <strong>Téléphone :</strong> ${escapeHtml(customerPhone)}</p>
        <p><strong>Adresse de livraison :</strong><br>${escapeHtml(fullAddress).replace(/\n/g, "<br>")}</p>
        <h3>Détail de la commande</h3>
        <ul>${listHtml || "<li>Aucun article retourné par Stripe</li>"}</ul>
        <h3>Demande particulière du client</h3>
        <p>${orderNote ? escapeHtml(orderNote).replace(/\n/g, "<br>") : "Aucune demande particulière."}</p>
        <p><strong>Total payé : ${total} €</strong></p>
        <p>Le paiement a été confirmé par Stripe.</p>
      </div>`;

    await mailer.sendMail({
      from: `"Les Mains d’Émeraude" <${process.env.GMAIL_USER}>`,
     to: process.env.ORDER_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
      replyTo: customerEmail || undefined,
      subject: `Nouvelle commande ${ref} — Les Mains d’Émeraude`,
      text: sellerText,
      html: sellerHtml
    });

    return response(200, "Customer confirmation and seller notification sent");
  } catch (err) {
    console.error("Order email sending failed:", err.message);
    return response(500, "Order email sending failed");
  }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body
  };
}
