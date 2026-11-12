(function(){
  const chains=["Chaîne 1","Chaîne 2","Chaîne 3","Chaîne 4"];
  const cart=window.LME.cart;
  let selectedType="collier", selectedChain=0, selectedCharms=[];
  const params=new URLSearchParams(location.search);
  const editIndexRaw=params.get("edit");
  const editingCartIndex=editIndexRaw!==null && /^\d+$/.test(editIndexRaw) ? Number(editIndexRaw) : -1;
  function charmInfo(charm){
    const btn=Array.from(document.querySelectorAll(".charmBtn"))[Number(charm)];
    const image=btn?.querySelector("img"); const label=btn?.querySelector("b");
    const name=label?label.textContent.replace(/\s*·\s*1\s*€\s*$/," ").trim():`Charm ${Number(charm)+1}`;
    return {name:name.replace(/\s+/g," ").trim(),src:image?.src||"",alt:image?.alt||name};
  }
  function chooseType(type){
    selectedType=type; const bracelet=type==="bracelet";
    const c=document.getElementById("typeCollierLabel"), b=document.getElementById("typeBraceletLabel");
    if(c){c.style.border=bracelet?"1px solid var(--line)":"2px solid var(--gold)";c.classList.toggle("active",!bracelet);}
    if(b){b.style.border=bracelet?"2px solid var(--gold)":"1px solid var(--line)";b.classList.toggle("active",bracelet);}
    const radio=document.querySelector(`input[name="jewelType"][value="${type}"]`); if(radio) radio.checked=true;
    renderSummary();
  }
  function chooseChain(i){
    selectedChain=i; document.querySelectorAll(".chainChoice").forEach((b,j)=>b.classList.toggle("active",j===i)); renderSummary();
  }
  function addCharm(i){selectedCharms.push(i);renderPlaced();renderSummary();}
  function removeCharm(index){selectedCharms.splice(index,1);renderPlaced();renderSummary();}
  function moveSelectedCharm(index,direction){
    const target=index+direction; if(target<0||target>=selectedCharms.length)return;
    [selectedCharms[index],selectedCharms[target]]=[selectedCharms[target],selectedCharms[index]];
    renderPlaced();renderSummary();
  }
  function renderCharmOrder(){
    const list=document.getElementById("selectedCharmOrder"); if(!list)return;
    list.innerHTML="";
    if(!selectedCharms.length){const empty=document.createElement("li");empty.className="charmOrderEmpty";empty.textContent="Aucun charm sélectionné pour le moment. Ajoute d’abord tes charms dans les collections ci-dessus.";list.appendChild(empty);return;}
    selectedCharms.forEach((charm,index)=>{
      const info=charmInfo(charm); const item=document.createElement("li");item.className="charmOrderItem";
      const number=document.createElement("span");number.className="charmOrderNumber";number.textContent=String(index+1);
      const img=document.createElement("img");img.src=info.src;img.alt=info.alt;
      const name=document.createElement("span");name.className="charmOrderName";name.textContent=info.name;
      const actions=document.createElement("div");actions.className="charmOrderActions";
      const up=document.createElement("button");up.type="button";up.className="charmOrderMove";up.textContent="↑";up.disabled=index===0;up.setAttribute("aria-label",`Déplacer ${info.name} vers le début`);up.addEventListener("click",()=>moveSelectedCharm(index,-1));
      const down=document.createElement("button");down.type="button";down.className="charmOrderMove";down.textContent="↓";down.disabled=index===selectedCharms.length-1;down.setAttribute("aria-label",`Déplacer ${info.name} vers la fin`);down.addEventListener("click",()=>moveSelectedCharm(index,1));
      actions.append(up,down);item.append(number,img,name,actions);list.appendChild(item);
    });
  }
  function renderPlaced(){
    const placed=document.getElementById("placed"); if(!placed)return; placed.innerHTML="";
    selectedCharms.forEach((charm,index)=>{
      const info=charmInfo(charm); if(!info.src)return;
      const img=document.createElement("img");img.className="placed";img.src=info.src;img.alt=info.alt;
      const angle=(index*137)%360, radius=110+(index%3)*45;
      img.style.transform=`translate(${Math.cos(angle*Math.PI/180)*radius}px,${Math.sin(angle*Math.PI/180)*radius}px)`;
      img.title="Cliquer pour retirer ce charm";img.style.cursor="pointer";img.onclick=()=>removeCharm(index);placed.appendChild(img);
    });
    const count=document.getElementById("count");if(count)count.textContent=selectedCharms.length+" charm"+(selectedCharms.length>1?"s":"");
    renderCharmOrder();
  }
  function renderSummary(){
    const rows=document.getElementById("rows");if(!rows)return;
    const base=selectedType==="bracelet"?9:12;const name=selectedType==="bracelet"?"Bracelet":"Collier";
    rows.innerHTML=`<div><span>${name} — ${chains[selectedChain]}</span><strong>${base} €</strong></div>`;
    selectedCharms.forEach(charm=>{const info=charmInfo(charm);rows.innerHTML+=`<div><span>${info.name.replace(/[&<>"']/g,'')}</span><strong>1 €</strong></div>`;});
    const total=document.getElementById("total");if(total)total.textContent=(base+selectedCharms.length)+" €";
  }
  function addConfiguredToCart(){
    const base=selectedType==="bracelet"?9:12;
    const item={type:selectedType,chain:selectedChain,charms:[...selectedCharms],charmNames:selectedCharms.map(ch=>charmInfo(ch).name),price:base+selectedCharms.length};
    if(editingCartIndex>=0 && cart[editingCartIndex] && !(cart[editingCartIndex].type||"").startsWith("catalogue-")) cart[editingCartIndex]=item;
    else cart.push(item);
    window.LME.saveCart();
    window.location.href="panier.html?ajoute=1";
  }
  window.chooseType=chooseType;window.chooseChain=chooseChain;window.addCharm=addCharm;window.removeCharm=removeCharm;window.addConfiguredToCart=addConfiguredToCart;
  if(editingCartIndex>=0 && cart[editingCartIndex] && !(cart[editingCartIndex].type||"").startsWith("catalogue-")){
    const item=cart[editingCartIndex];selectedType=item.type||"collier";selectedChain=Number(item.chain)||0;selectedCharms=Array.isArray(item.charms)?[...item.charms]:[];
  }
  chooseType(selectedType);chooseChain(selectedChain);renderPlaced();renderSummary();
})();
