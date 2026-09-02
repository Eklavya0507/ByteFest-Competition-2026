(function(){
 const API=window.BYTEFEST_CONFIG.API_URL,token=sessionStorage.getItem("bytefest_bughunt_token");
 const PAGE={waiting_start:"bughunt-waiting.html",round1:"bughunt-round1.html",round2:"bughunt-round2.html",round3:"bughunt-round3.html",surprise:"bughunt-surprise.html",final:"bughunt-final.html",awaiting_ranking:"bughunt-waiting.html",eliminated:"bughunt-waiting.html",completed:"bughunt-waiting.html"};
 if(!token){location.replace("participant-login.html");return}
 history.pushState(null,"",location.href);addEventListener("popstate",()=>history.go(1));
 async function read(r){const t=await r.text();try{return t?JSON.parse(t):{}}catch{return{}}}
 async function load(){
  try{
   const r=await fetch(`${API}/api/bughunt/state`,{headers:{Authorization:`Bearer ${token}`}});
   const d=await read(r);if(r.status===401){sessionStorage.removeItem("bytefest_bughunt_token");location.replace("participant-login.html");return}
   if(!r.ok)throw new Error(d.message||"Unable to load Bug Hunt state");
   const title=document.getElementById("waitTitle"),msg=document.getElementById("waitMessage"),st=document.getElementById("waitStatus");
   if(["round1","round2","round3","surprise","final"].includes(d.currentRound)){location.replace(PAGE[d.currentRound]);return}
   if(d.security?.disqualified){title.textContent="DISQUALIFIED";msg.textContent="Your team is currently disqualified. If the coordinator grants ONE MORE CHANCE, this page will automatically return you to the current official Bug Hunt phase.";st.textContent="WAITING FOR COORDINATOR";return}
   if(d.currentRound==="eliminated"){title.textContent="THANK YOU";msg.textContent="Your Bug Hunt run is complete. Final qualification was not reached.";st.textContent=d.rank?`RANK #${d.rank}`:"ELIMINATED";return}
   if(d.currentRound==="completed"){title.textContent=d.finalPlace?`FINAL #${d.finalPlace}`:"COMPLETED";msg.textContent="Bug Hunt is completed.";st.textContent="RESULT SAVED";return}
   title.textContent="WAIT FOR START";msg.textContent="Keep this page open. The next official stage will open automatically.";st.textContent="CHECKING OFFICIAL TIMER";
  }catch(e){document.getElementById("waitStatus").textContent=e.message}
 }
 load();setInterval(load,2000);
})();
