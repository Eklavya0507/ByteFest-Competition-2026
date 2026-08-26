(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;
  const token1 = sessionStorage.getItem("bytefest_checkmate_player1_token");
  const token2 = sessionStorage.getItem("bytefest_checkmate_player2_token");
  if (!token1 || !token2) { location.replace("participant-login.html"); return; }

  history.pushState(null, "", location.href);
  addEventListener("popstate", () => history.go(1));

  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const pieceGlyph = { wp:"♙", wn:"♘", wb:"♗", wr:"♖", wq:"♕", wk:"♔", bp:"♟", bn:"♞", bb:"♝", br:"♜", bq:"♛", bk:"♚" };
  const capturedName = { p:"pawn", n:"knight", b:"bishop", r:"rook", q:"queen" };
  let chess = null, state1 = null, state2 = null, match = null, whiteToken = null, blackToken = null;
  let selected = "", legalMoves = [], moveBusy = false, lastMove = null;

  async function read(response) { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return {}; } }
  async function request(token, path, options={}) {
    const response = await fetch(`${API}/api/checkmate${path}`, { ...options, headers:{ Authorization:`Bearer ${token}`, ...(options.headers||{}) } });
    const data = await read(response);
    if (response.status===401) { sessionStorage.clear(); location.replace("participant-login.html"); throw new Error("Session expired"); }
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }
  function clock(ms){ const total=Math.max(0,Math.ceil(Number(ms||0)/1000)); return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`; }
  function label(v){ return String(v||"").replaceAll("_"," ").toUpperCase(); }
  function message(text,bad=false){ const el=document.getElementById("matchMessage"); el.className=`status ${bad?"bad":"good"}`; el.textContent=text||""; }

  function mapTokens() {
    if (!state1?.match || !state2?.match || state1.match.id !== state2.match.id) throw new Error("Both logged-in players must belong to the same Checkmate match");
    whiteToken = state1.you?.color === "white" ? token1 : state2.you?.color === "white" ? token2 : null;
    blackToken = state1.you?.color === "black" ? token1 : state2.you?.color === "black" ? token2 : null;
    if (!whiteToken || !blackToken) throw new Error("Unable to identify White and Black players for this match");
  }

  function syncChess(fen) {
    if (typeof Chess !== "function") { message("Chess board engine failed to load. Check internet connection and refresh.", true); return; }
    const target = fen || START_FEN;
    if (!chess || chess.fen() !== target) {
      try { chess = new Chess(target); } catch { chess = new Chess(); }
      selected=""; legalMoves=[];
    }
  }

  function renderBoard() {
    const board=document.getElementById("chessBoard");
    if (!chess) { board.innerHTML='<div style="grid-column:1/-1;padding:30px">Loading chess board...</div>'; return; }
    const map={};
    chess.board().forEach((rank,r)=>rank.forEach((piece,c)=>{ if(piece){ const sq=`${"abcdefgh"[c]}${8-r}`; map[sq]=piece; } }));
    let html="";
    for(let rank=8;rank>=1;rank--){
      for(let file=0;file<8;file++){
        const sq=`${"abcdefgh"[file]}${rank}`;
        const piece=map[sq];
        const lm=legalMoves.find(m=>m.to===sq);
        const cls=["cm-square",((file+rank)%2===0?"dark":"light"),selected===sq?"selected":"",lm?(lm.captured?"capture":"legal"):"",lastMove&&(lastMove.from===sq||lastMove.to===sq)?"last":""].filter(Boolean).join(" ");
        html+=`<button type="button" class="${cls}" data-square="${sq}" aria-label="${sq}">${piece?pieceGlyph[piece.color+piece.type]:""}</button>`;
      }
    }
    board.innerHTML=html;
  }

  function gameOutcome(moveColor){
    if (!chess || !chess.game_over()) return {result:"",reason:""};
    if (chess.in_checkmate()) return { result: moveColor==="white"?"white_win":"black_win", reason:"Checkmate" };
    if (chess.in_stalemate()) return {result:"draw",reason:"Stalemate"};
    if (chess.in_threefold_repetition()) return {result:"draw",reason:"Threefold repetition"};
    if (chess.insufficient_material()) return {result:"draw",reason:"Insufficient material"};
    if (chess.in_draw()) return {result:"draw",reason:"Draw"};
    return {result:"",reason:""};
  }

  async function makeMove(from,to){
    if(moveBusy||!match||match.status!=="running")return;
    const active=match.activeColor;
    const expectedTurn=active==="white"?"w":"b";
    if(chess.turn()!==expectedTurn){ syncChess(match.fen||START_FEN); renderBoard(); return; }
    const move=chess.move({from,to,promotion:"q"});
    if(!move){ selected=""; legalMoves=[]; renderBoard(); return; }
    moveBusy=true; renderBoard();
    try{
      const outcome=gameOutcome(active);
      await request(active==="white"?whiteToken:blackToken,"/move",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          capturedPiece: move.captured ? capturedName[move.captured] : "",
          fen: chess.fen(), notation: move.san || `${from}-${to}`,
          from, to, boardResult: outcome.result, boardResultReason: outcome.reason
        })
      });
      lastMove={from,to}; selected=""; legalMoves=[]; await load();
    }catch(error){ chess.undo(); selected=""; legalMoves=[]; renderBoard(); message(error.message,true); }
    finally{moveBusy=false;}
  }

  document.getElementById("chessBoard").addEventListener("click", e=>{
    const btn=e.target.closest(".cm-square"); if(!btn||!chess||moveBusy||!match)return;
    if(match.status!=="running" || state1?.eventControl?.status!=="running"){ message("Match is not running.",true); return; }
    const sq=btn.dataset.square;
    if(selected){ const valid=legalMoves.some(m=>m.to===sq); if(valid){ makeMove(selected,sq); return; } }
    const piece=chess.get(sq);
    const wanted=match.activeColor==="white"?"w":"b";
    if(piece && piece.color===wanted){ selected=sq; legalMoves=chess.moves({square:sq,verbose:true}); } else { selected=""; legalMoves=[]; }
    renderBoard();
  });

  function render(){
    match=state1.match;
    document.getElementById("phasePill").textContent=label(match.phase);
    document.getElementById("boardPill").textContent=`BOARD ${match.boardNumber}`;
    document.getElementById("matchStatusPill").textContent=label(match.status);
    for(const c of ["white","black"]){
      document.getElementById(`${c}Name`).textContent=match[`${c}Name`];
      document.getElementById(`${c}Clock`).textContent=clock(match[`${c}TimeMs`]);
      document.getElementById(`${c}Material`).textContent=match[`${c}Material`];
      document.getElementById(`${c}Moves`).textContent=match[`${c}Moves`];
      document.getElementById(`${c}Tournament`).textContent=Number(match[`${c}TournamentPoints`]||0).toFixed(1);
      document.getElementById(`${c}Card`).classList.toggle("active",match.status==="running"&&match.activeColor===c);
    }
    const diff=Number(match.whiteMaterial)-Number(match.blackMaterial);
    document.getElementById("materialDiff").textContent=diff===0?"EVEN MATERIAL":diff>0?`WHITE +${diff}`:`BLACK +${Math.abs(diff)}`;
    document.getElementById("fullMove").textContent=`${match.fullMoves} / 50 full moves`;
    document.getElementById("turnLabel").textContent=match.status==="completed"?`RESULT · ${label(match.result)}`:match.status==="paused"?"MATCH STOPPED":match.status==="waiting"?"WAITING FOR ADMIN START":`${match.activeColor.toUpperCase()} TO MOVE`;
    syncChess(match.fen||START_FEN); renderBoard();
    document.getElementById("whiteResign").disabled=match.status!=="running";
    document.getElementById("blackResign").disabled=match.status!=="running";
    if(match.status==="completed") message(`${label(match.result)} · ${match.resultReason||"Match completed"}`);
    else if(state1.eventControl?.status==="paused") message("Checkmate is stopped by the coordinator.",true);
    else if(match.status==="waiting") message("Both players are logged in. Wait for admin to start this match.");
    else message(`${match.activeColor.toUpperCase()} to move · click piece then destination.`);
  }

  async function load(){
    try{
      [state1,state2]=await Promise.all([request(token1,"/state"),request(token2,"/state")]);
      if(!state1.match||!state2.match){ location.replace("checkmate-waiting.html"); return; }
      mapTokens(); render();
    }catch(error){ message(error.message,true); }
  }

  async function resign(color){
    if(!confirm(`${color.toUpperCase()} resigns this match?`))return;
    try{ await request(color==="white"?whiteToken:blackToken,"/resign",{method:"POST"}); await load(); }catch(error){message(error.message,true);}
  }
  document.getElementById("whiteResign").onclick=()=>resign("white");
  document.getElementById("blackResign").onclick=()=>resign("black");
  document.getElementById("refreshMatch").onclick=load;

  const gate=document.getElementById("checkmateSecureGate");
  document.getElementById("enterCheckmateFullscreen").onclick=async()=>{
    try{ await document.documentElement.requestFullscreen(); gate.classList.remove("active"); document.getElementById("fullscreenStatus").textContent=""; }
    catch{ document.getElementById("fullscreenStatus").textContent="Fullscreen permission is required."; }
  };
  document.addEventListener("fullscreenchange",()=>{ if(!document.fullscreenElement) gate.classList.add("active"); else gate.classList.remove("active"); });

  load(); setInterval(()=>{ if(!moveBusy) load(); },1500);
})();
