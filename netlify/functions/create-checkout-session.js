const Stripe = require("stripe");

const STOCK_STORE = "lme-unique-products";
const stockKey = (productId) => `catalogue:${productId}`;

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

    const cataloguePrices = {
      "catalogue-bracelet": 1400,
      "catalogue-collier": 1700,
      "catalogue-bague": 850,
      "catalogue-boucles": 850
    };
    const catalogueLimits = {
      "catalogue-bracelet": 12,
      "catalogue-collier": 17,
      "catalogue-bague": 23,
      "catalogue-boucles": 8
    };
    const catalogueIds = cart
      .filter((item) => item && typeof item.type === "string" && item.type.startsWith("catalogue-"))
      .map((item) => item.productId);
    if (catalogueIds.some((id) => typeof id !== "string") || new Set(catalogueIds).size !== catalogueIds.length) {
      throw new Error("Un même bijou unique ne peut apparaître qu’une seule fois dans le panier.");
    }

    const line_items = cart.map((item) => {
      if (item && typeof item.type === "string" && item.type.startsWith("catalogue-")) {
        const cents = cataloguePrices[item.type];
        const limit = catalogueLimits[item.type];
        const match = typeof item.productId === "string"
          ? item.productId.match(/^(?:bracelets|colliers|bagues|boucles-doreilles)-(\d{2})$/)
          : null;
        const number = match ? Number(match[1]) : 0;
        const expectedPrefix = {
          "catalogue-bracelet": "bracelets",
          "catalogue-collier": "colliers",
          "catalogue-bague": "bagues",
          "catalogue-boucles": "boucles-doreilles"
        }[item.type];
        if (!cents || !match || !item.productId.startsWith(expectedPrefix + "-") || number < 1 || number > limit) {
          throw new Error("Un produit du catalogue n’est pas valide. Vérifie le panier.");
        }
        const labels = {
          "catalogue-bracelet": "Bracelet prêt à porter",
          "catalogue-collier": "Collier prêt à porter",
          "catalogue-bague": "Bague prête à porter",
          "catalogue-boucles": "Boucles d’oreilles prêtes à porter"
        };
        return {
          price_data: {
            currency: "eur",
            unit_amount: cents,
            product_data: {
              // Reprend exactement le nom affiché sur la fiche du catalogue.
              name: (typeof item.title === "string" && item.title.trim())
                ? item.title.trim().slice(0, 200)
                : `${labels[item.type]} — modèle ${String(number).padStart(2, "0")}`,
              description: "Bijou fait main — Les Mains d’Émeraude",
              metadata: { product_id: item.productId }
            }
          },
          quantity: 1
        };
      }
      if (!item || !["bracelet", "collier"].includes(item.type) ||
          !Number.isInteger(Number(item.chain)) || Number(item.chain) < 0 || Number(item.chain) > 3 ||
          !Array.isArray(item.charms) || item.charms.length > 145 ||
          !item.charms.every((c) => Number.isInteger(Number(c)) && Number(c) >= 0 && Number(c) < 145)) {
        throw new Error("Un bijou ou un charm n’est pas valide. Vérifie le panier.");
      }
      const base = item.type === "bracelet" ? 9 : 12;
      const price = base + item.charms.length;
      const suppliedNames = Array.isArray(item.charmNames) ? item.charmNames : [];
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
            description: `${chainNames[Number(item.chain)]} · ordre des charms de gauche à droite : ${names || "aucun charm"}`
          }
        },
        quantity: 1
      };
    });

    const subtotal = cart.reduce((sum, item) => {
      if (item && typeof item.type === "string" && item.type.startsWith("catalogue-")) {
        return sum + (cataloguePrices[item.type] || 0);
      }
      return sum + (item.type === "bracelet" ? 9 : 12) * 100 + item.charms.length * 100;
    }, 0) / 100;

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

    // Le code BIENVENUE est limité à la première commande par Stripe.
    // Créer dans Stripe un code promotionnel avec la restriction « première commande uniquement »,
    // puis renseigner son identifiant dans STRIPE_BIENVENUE_PROMOTION_CODE_ID.
    const wantsWelcome = String(payload.promoCode || "").trim().toUpperCase() === "BIENVENUE";
    const welcomePromotionId = process.env.STRIPE_BIENVENUE_PROMOTION_CODE_ID;
    if (wantsWelcome && !welcomePromotionId) {
      return reply(500, { error: "Le code BIENVENUE n’est pas encore configuré dans Stripe. Aucun paiement n’a été lancé." });
    }

    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const siteUrl = process.env.URL.replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_creation: "always",
      ...(wantsWelcome ? { discounts: [{ promotion_code: welcomePromotionId }] } : {}),
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["FR"] },
      phone_number_collection: { enabled: true },
      success_url: `${siteUrl}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?paiement=annule`,
      metadata: { source: "les-mains-d-emeraude", charm_count: String(cart.reduce((n, i) => n + (Array.isArray(i.charms) ? i.charms.length : 0), 0)) }
    });

    // Une réservation atomique empêche deux clientes de payer la même pièce unique.
    const reservedKeys = [];
    if (catalogueIds.length) {
      const { connectLambda, getStore } = await import("@netlify/blobs");
      connectLambda(event);
      const stock = getStore({ name: STOCK_STORE, region: "eu-central-1" });
      try {
        for (const productId of catalogueIds) {
          const result = await stock.set(stockKey(productId), `reserved:${session.id}`, { onlyIfNew: true });
          if (!result.modified) {
            throw new Error(`« ${productId} » vient d’être réservé ou vendu. Actualise la boutique et vérifie ton panier.`);
          }
          reservedKeys.push(stockKey(productId));
        }
      } catch (reservationError) {
        for (const key of reservedKeys) {
          const current = await stock.get(key, { type: "text" });
          if (current === `reserved:${session.id}`) await stock.delete(key);
        }
        await stripe.checkout.sessions.expire(session.id).catch(() => {});
        return reply(409, { error: reservationError.message || "Ce bijou n’est plus disponible." });
      }
    }
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
