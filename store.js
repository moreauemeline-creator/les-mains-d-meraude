(function(){
  const STORAGE_KEY = "lme_cart";
  let cart = [];
  let promoApplied = false;
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); if (Array.isArray(saved)) cart = saved; } catch (_) { cart = []; }
  const LME = window.LME = window.LME || {};
  LME.cart = cart;
  function euro(n){ return Number(n || 0).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}) + " €"; }
  function saveCart(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (_) {} updateCartCount(); }
  function updateCartCount(){ document.querySelectorAll("[data-cart-count], #headerCartCountFixed, #headerCartCount").forEach(el => el.textContent = String(cart.length)); }
  function itemLabel(item){
    if(item.type && item.type.startsWith("catalogue-")) return `${item.title || "Bijou"} · ${euro(item.price)}`;
    const type = item.type === "bracelet" ? "Bracelet" : "Collier";
    const chain = ["Chaîne 1","Chaîne 2","Chaîne 3","Chaîne 4"][Number(item.chain)] || "Chaîne";
    const names = Array.isArray(item.charmNames) ? item.charmNames : [];
    const charms = names.length ? names.join(" → ") : ((item.charms || []).length ? (item.charms || []).map((c,i)=>"Charm "+(Number(c)+1)).join(" → ") : "sans charm");
    return `${type} — ${chain} · Ordre des charms : ${charms} · ${euro(item.price)}`;
  }
  function renderCart(){
    updateCartCount();
    const el = document.getElementById("cartItems");
    if(!el) return;
    const count = document.getElementById("cartCount"); if(count) count.textContent = `(${cart.length} bijou${cart.length>1?"x":""})`;
    el.innerHTML = "";
    cart.forEach((item,index)=>{
      const row=document.createElement("div"); row.className="cartLine";
      const info=document.createElement("div"); info.className="cartLineSummary"; info.textContent=itemLabel(item);
      const edit=document.createElement("button"); edit.type="button";
      if(item.type && item.type.startsWith("catalogue-")){ edit.textContent="Prêt à porter"; edit.disabled=true; }
      else { edit.textContent="Modifier"; edit.addEventListener("click",()=>{ window.location.href=`bar-a-charms.html?edit=${index}`; }); }
      const remove=document.createElement("button"); remove.type="button"; remove.textContent="Retirer";
      remove.addEventListener("click",()=>{ cart.splice(index,1); saveCart(); renderCart(); });
      row.append(info,edit,remove); el.appendChild(row);
    });
    if(!cart.length) el.textContent="Ton panier est vide pour le moment.";
    const subtotal = cart.reduce((sum,it)=>sum+Number(it.price||0),0);
    const discount = promoApplied ? Math.round(subtotal*10)/100 : 0;
    const freeShipping = subtotal >= 60;
    const cartTotal=document.getElementById("cartTotal"); if(cartTotal) cartTotal.textContent=euro(subtotal);
    const breakdown=document.getElementById("cartBreakdown");
    if(breakdown){
      breakdown.innerHTML =
        `<div class="breakdownRow"><span>Sous-total des bijoux</span><strong>${euro(subtotal)}</strong></div>`+
        (promoApplied?`<div class="breakdownRow"><span>Code BIENVENUE (−10 %)</span><strong>−${euro(discount)}</strong></div>`:"")+ 
        `<div class="breakdownRow"><span>Frais de port</span><strong>${freeShipping?"Offerts": "4,50 €"}</strong></div>`+
        `<div class="breakdownRow breakdownGrand"><span>Total avec livraison</span><strong>${euro(subtotal-discount+(freeShipping?0:4.5))}</strong></div>`+
        `<p class="cartHint">${freeShipping?"Bonne nouvelle : la livraison est offerte dès 60 € d’achat.":`Il reste ${euro(Math.max(0,60-subtotal))} d’achat pour obtenir la livraison offerte.`}</p>`;
    }
  }
  function addCatalogueItem(item){ cart.push(item); saveCart(); renderCart(); }
  function applyPromo(){
    const field=document.getElementById("promoCode"); const msg=document.getElementById("promoMessage");
    const code=(field?.value||"").trim().toUpperCase();
    if(code === "BIENVENUE"){
      promoApplied=true;
      if(msg){msg.textContent="Code BIENVENUE pris en compte : −10 % sur une première commande uniquement. Stripe vérifiera ton éligibilité au paiement.";msg.style.color="var(--green)";}
    } else {
      promoApplied=false;
      if(msg){msg.textContent="Code non reconnu. Vérifie l’orthographe.";msg.style.color="#a33";}
    }
    renderCart();
  }
  async function beginCheckout(){
    const note=document.getElementById("checkoutNote");
    if(!cart.length){ if(note) note.textContent="Ajoute d’abord un bijou au panier."; return; }
    const emailField=document.getElementById("customerEmail");
    const email=(emailField?.value||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      if(note) note.textContent="Merci de renseigner une adresse e-mail valide avant de passer commande.";
      emailField?.focus();
      return;
    }
    if(note) note.textContent="Préparation du paiement sécurisé…";
    try{
      const response=await fetch("/.netlify/functions/create-checkout-session",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({cart:cart.map(item=>({...item,charmNames:Array.isArray(item.charmNames)?item.charmNames:[]})),email,promoCode:promoApplied?"BIENVENUE":""})
      });
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || "Impossible de préparer le paiement.");
      if(!data.url) throw new Error("Stripe n’a pas renvoyé de lien de paiement.");
      window.location.assign(data.url);
    }catch(err){ if(note) note.textContent=err.message || "Erreur de connexion. Réessaie plus tard."; }
  }
  LME.saveCart=saveCart; LME.renderCart=renderCart; LME.addCatalogueItem=addCatalogueItem; LME.updateCartCount=updateCartCount; LME.clearCart=()=>{cart.length=0;saveCart();};
  window.saveCart=saveCart; window.renderCart=renderCart; window.applyPromo=applyPromo; window.beginCheckout=beginCheckout;
  document.addEventListener("DOMContentLoaded",()=>{
    updateCartCount(); renderCart();
    const params=new URLSearchParams(location.search);
    if(params.get("paiement")==="annule"){
      const note=document.getElementById("homeNotice"); if(note) note.textContent="Le paiement a été annulé. Ton panier est conservé.";
    }
  });
})();
