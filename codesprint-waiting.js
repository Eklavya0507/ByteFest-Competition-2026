(function(){
const API=window.BYTEFEST_CONFIG.API_URL, token=sessionStorage.getItem("bytefest_codesprint_token");
const PAGE={round1:"codesprint-round1.html",round2:"codesprint-round2.html",qualifier:"codesprint-qualifier.html",semifinal:"codesprint-semifinal.html",wildcard:"codesprint-wildcard.html",entry_final:"codesprint-entry-final.html",wildcard_final:"codesprint-wildcard-final.html",final:"codesprint-final.html"};
if(!token){location.replace("participant-login.html");return;}
async function load(){
 const r=await fetch(`${API}/api/codesprint/state`,{headers:{Authorization:`Bearer ${token}`}}); const d=await r.json();
 if(r.status===401){sessionStorage.removeItem("bytefest_codesprint_token");location.replace("participant-login.html");return;}
 if(PAGE[d.currentRound]){location.replace(PAGE[d.currentRound]);return;}
 document.getElementById("waitTeam").textContent=d.teamId; document.getElementById("waitScore").textContent=d.totalScore;
 const rank=document.getElementById("waitRank"); if(d.rank){rank.hidden=false;rank.textContent=`RANK #${d.rank}`;}
 const title=document.getElementById("waitTitle"), text=document.getElementById("waitText");
 const messages={
  awaiting_ranking:["Qualifier Completed","Waiting for all teams to finish. Ranking and the parallel Semifinal / Wildcard Entry will open automatically."],
  semifinal_loser_wait:["Semifinal Completed","Waiting for both semifinals. The best semifinal loser will be selected automatically."],
  entry_final_wait:["Wildcard Entry Won","Waiting for the other Wildcard Entry match to finish. Entry Final will open automatically."],
  wildcard_final_wait:["Waiting for Final Wildcard Match","The required opponent/path is still being resolved automatically."],
  final_wait:["Grand Final Qualified","Waiting for all three finalists. The Grand Final will open automatically."],
  eliminated:["Competition Completed","Your current Code Sprint path has ended. Thank you for competing."],
  completed:[d.finalPlace===1?"🏆 Code Sprint Champion":d.finalPlace===2?"🥈 Second Place":"🥉 Third Place",`Grand Final completed. Final place: #${d.finalPlace || "-"}.`]
 };
 const m=messages[d.currentRound]||["Waiting","Please keep this page open."]; title.textContent=m[0];text.textContent=m[1];
}
document.getElementById("refreshStatus").addEventListener("click",load); load(); setInterval(load,5000);
}());
