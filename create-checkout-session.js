const Stripe = require("stripe");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return reply(204, {});
  if (event.httpMethod !== "POST") return reply(405, { error: "Méthode non autorisée." });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.URL) {
    return reply(500, { error: "Configuration Stripe/Netlify incomplète. Aucun paiement n’a été lancé." });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const cart = payload.cart;
    if (!Array.isArray(cart) || cart.length < 1 || cart.length > 30) {
      return reply(400, { error: "Panier invalide." });
    }

    const line_items = cart.map((item) => {
      if (!item || !["bracelet", "collier"].includes(item.type) ||
          !Number.isInteger(Number(item.chain)) || Number(item.chain) < 0 || Number(item.chain) > 3 ||
          !Array.isArray(item.charms) || item.charms.length > 145 ||
          !item.charms.every((c) => Number.isInteger(Number(c)) && Number(c) >= 0 && Number(c) < 145)) {
        throw new Error("Un bijou ou un charm n’est pas valide. Vérifie le panier.");
      }
      const base = item.type === "bracelet" ? 9 : 12;
      const price = base + item.charms.length;
      const suppliedNames = Array.isArray(item.charmNames) ? item.charmNames : [];
      // Names are descriptive only; server-side fixed prices above remain authoritative.
      const names = item.charms.map((c, index) => {
        const name = suppliedNames[index];
        return typeof name === "string" && name.trim()
          ? name.trim().slice(0, 80)
          : `Charm ${Number(c) + 1}`;
      }).join(", ");
      const chainNames = ["Chaîne 1", "Chaîne 2", "Chaîne 3", "Chaîne 4"];
      const productName = item.type === "bracelet" ? "Bracelet personnalisé" : "Collier personnalisé";
      return {
        price_data: {
          currency: "eur",
          unit_amount: price * 100,
          product_data: {
            name: productName,
            description: `${chainNames[Number(item.chain)]} · ${item.charms.length} charm(s)${names ? " : " + names : ""}`
          }
        },
        quantity: 1
      };
    });

    const subtotal = cart.reduce((sum, item) =>
      sum + (item.type === "bracelet" ? 9 : 12) + item.charms.length, 0);

    // Livraison offerte à partir de 60 € de bijoux, avant réduction.
    if (subtotal < 60) {
      line_items.push({
        price_data: {
          currency: "eur",
          unit_amount: 450,
          product_data: { name: "Frais de livraison — France métropolitaine" }
        },
        quantity: 1
      });
    }

    // BIENVENUE est désactivé côté serveur tant qu’un stockage fiable ne permet pas
    // de vérifier qu’il s’agit bien de la première commande du client.
    if (String(payload.promoCode || "").trim().toUpperCase() === "BIENVENUE") {
      return reply(400, { error: "Le code BIENVENUE n’est pas encore activé pour le paiement réel. Aucun paiement n’a été lancé." });
    }

    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const siteUrl = process.env.URL.replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["FR"] },
      phone_number_collection: { enabled: true },
      success_url: `${siteUrl}/?paiement=succes&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?paiement=annule`,
      metadata: { source: "les-mains-d-emeraude", charm_count: String(cart.reduce((n, i) => n + i.charms.length, 0)) }
    });
    return reply(200, { url: session.url });
  } catch (error) {
    return reply(400, { error: error.message || "Erreur lors de la préparation du paiement." });
  }
};

function reply(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: statusCode === 204 ? "" : JSON.stringify(data)
  };
}
