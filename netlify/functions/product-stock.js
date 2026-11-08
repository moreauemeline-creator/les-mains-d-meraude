exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return reply(405, { error: "Méthode non autorisée." });
  try {
    const { connectLambda, getStore } = await import("@netlify/blobs");
    connectLambda(event);
    const stock = getStore({ name: "lme-unique-products", region: "eu-central-1", consistency: "strong" });
    const ids = ["bagues-01", "bagues-02", "bagues-03", "bagues-04", "bagues-05", "bagues-06", "bagues-07", "bagues-08", "bagues-09", "bagues-10", "bagues-11", "bagues-12", "bagues-13", "bagues-14", "bagues-15", "bagues-16", "bagues-17", "bagues-18", "bagues-19", "bagues-20", "bagues-21", "bagues-22", "bagues-23", "boucles-doreilles-01", "boucles-doreilles-02", "boucles-doreilles-03", "boucles-doreilles-04", "boucles-doreilles-05", "boucles-doreilles-06", "boucles-doreilles-07", "boucles-doreilles-08", "bracelets-01", "bracelets-02", "bracelets-03", "bracelets-04", "bracelets-05", "bracelets-06", "bracelets-07", "bracelets-08", "bracelets-09", "bracelets-10", "bracelets-11", "bracelets-12", "colliers-01", "colliers-02", "colliers-03", "colliers-04", "colliers-05", "colliers-06", "colliers-07", "colliers-08", "colliers-09", "colliers-10", "colliers-11", "colliers-12", "colliers-13", "colliers-14", "colliers-15", "colliers-16", "colliers-17"];
    const entries = await Promise.all(ids.map(async (id) => {
      const value = await stock.get(`catalogue:${id}`, { type: "text" });
      return [id, value === "sold" ? "sold" : (typeof value === "string" && value.startsWith("reserved:") ? "reserved" : "available")];
    }));
    return reply(200, { products: Object.fromEntries(entries) });
  } catch (error) {
    console.error("Stock read failed:", error.message);
    return reply(500, { error: "Impossible de charger les disponibilités." });
  }
};
function reply(statusCode, data) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(data) };
}
