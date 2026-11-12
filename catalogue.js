(function(){
  const root=document.getElementById("catalogueProduits");if(!root)return;
  root.querySelectorAll("[data-filter]").forEach(btn=>btn.addEventListener("click",()=>{
    root.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===btn));
    root.querySelectorAll(".catalogueCard").forEach(card=>card.hidden=btn.dataset.filter!=="Tous"&&card.dataset.cat!==btn.dataset.filter);
  }));
  root.querySelectorAll(".catalogueAdd").forEach(btn=>btn.addEventListener("click",()=>{
    if(btn.disabled)return;
    const cat=btn.dataset.cat;
    const type=cat==="Bracelets"?"catalogue-bracelet":cat==="Colliers"?"catalogue-collier":cat==="Bagues"?"catalogue-bague":"catalogue-boucles";
    window.LME.addCatalogueItem({type,productId:btn.dataset.product,title:btn.dataset.title,price:Number(btn.dataset.price),charms:[]});
    const original=btn.textContent;btn.textContent="Ajouté au panier ✓";window.setTimeout(()=>{if(!btn.disabled)btn.textContent=original;},1300);
  }));
  async function refreshUniqueProductStock(){
    try{
      const response=await fetch("/.netlify/functions/product-stock",{cache:"no-store"});if(!response.ok)throw new Error("Stock indisponible");
      const data=await response.json();
      root.querySelectorAll(".catalogueCard").forEach(card=>{
        const btn=card.querySelector(".catalogueAdd");if(!btn)return;
        const state=(data.products||{})[btn.dataset.product]||"available";let badge=card.querySelector(".stockBadge");
        if(!badge){badge=document.createElement("span");badge.className="stockBadge";btn.parentNode.insertBefore(badge,btn);}
        if(state==="sold"){badge.textContent="Vendu";badge.className="stockBadge sold";btn.textContent="Vendu";btn.disabled=true;}
        else if(state==="reserved"){badge.textContent="Réservation en cours";badge.className="stockBadge reserved";btn.textContent="Indisponible temporairement";btn.disabled=true;}
        else{badge.remove();btn.textContent="Ajouter au panier";btn.disabled=false;}
      });
    }catch(error){console.warn("Impossible de charger les disponibilités des bijoux.",error);}
  }
  refreshUniqueProductStock();document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshUniqueProductStock();});
})();
