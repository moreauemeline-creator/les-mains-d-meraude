(function(){
  const params=new URLSearchParams(location.search);const sessionId=params.get("session_id");
  if(window.LME) window.LME.clearCart();
  const ref=document.getElementById("orderReference");if(ref && sessionId) ref.textContent="Référence de paiement : "+sessionId.slice(-8).toUpperCase();
})();
