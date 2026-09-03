(function () {
  const API = window.BYTEFEST_CONFIG.API_URL;
  const token1 = sessionStorage.getItem("bytefest_checkmate_player1_token");
  const token2 = sessionStorage.getItem("bytefest_checkmate_player2_token");
  const coordinatorGrantKey = "bytefest_checkmate_coordinator_grant";
  if (!token1 || !token2) { location.replace("participant-login.html"); return; }

  history.pushState(null, "", location.href);
  addEventListener("popstate", () => history.go(1));

  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const pieceGlyph = { p:"♟", n:"♞", b:"♝", r:"♜", q:"♛", k:"♚" };
  const capturedName = { p:"pawn", n:"knight", b:"bishop", r:"rook", q:"queen" };
  const pieceValue = { pawn:1, knight:3, bishop:3, rook:5, queen:9 };

  let chess = null, state1 = null, state2 = null, match = null;
  let whiteToken = null, blackToken = null;
  let selected = "", legalMoves = [], moveBusy = false, lastMove = null;
  let refreshBusy = false, bootstrapped = false;
  let securityArmed = false, securityReportBusy = false;

  // The server remains authoritative. Between syncs we animate the clock locally,
  // so the 8+3 display stays smooth instead of jumping every network poll.
  let clockBase = { white:0, black:0, active:null, running:false, at:performance.now() };

  async function read(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  }

  async function request(token, path, options={}) {
    const response = await fetch(`${API}/api/checkmate${path}`, {
      ...options,
      headers:{ Authorization:`Bearer ${token}`, ...(options.headers||{}) }
    });
    const data = await read(response);
    if (response.status===401) {
      sessionStorage.clear();
      location.replace("participant-login.html");
      throw new Error("Session expired");
    }
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }

  function clock(ms) {
    const total=Math.max(0,Math.ceil(Number(ms||0)/1000));
    return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
  }

  function label(v){ return String(v||"").replaceAll("_"," ").toUpperCase(); }

  function message(text,bad=false){
    const el=document.getElementById("matchMessage");
    el.className=`status ${bad?"bad":"good"}`;
    el.textContent=text||"";
  }

  function mapTokens() {
    if (!state1?.match || !state2?.match || state1.match.id !== state2.match.id) {
      throw new Error("Both logged-in players must belong to the same Checkmate match");
    }
    whiteToken = state1.you?.color === "white" ? token1 : state2.you?.color === "white" ? token2 : null;
    blackToken = state1.you?.color === "black" ? token1 : state2.you?.color === "black" ? token2 : null;
    if (!whiteToken || !blackToken) throw new Error("Unable to identify White and Black players for this match");
  }

  function syncClockBase() {
    if (!match) return;
    clockBase = {
      white:Number(match.whiteTimeMs||0),
      black:Number(match.blackTimeMs||0),
      active:match.activeColor,
      running:match.status==="running" && state1?.eventControl?.status==="running" && !state1?.security?.locked,
      at:performance.now()
    };
  }

  function liveTimes() {
    let white=clockBase.white, black=clockBase.black;
    if (clockBase.running && clockBase.active) {
      const elapsed=Math.max(0,performance.now()-clockBase.at);
      if (clockBase.active==="white") white=Math.max(0,white-elapsed);
      if (clockBase.active==="black") black=Math.max(0,black-elapsed);
    }
    return {white,black};
  }

  function paintClocks() {
    if (!match) return;
    const times=liveTimes();
    const whiteEl=document.getElementById("whiteClock");
    const blackEl=document.getElementById("blackClock");
    if (whiteEl) whiteEl.textContent=clock(times.white);
    if (blackEl) blackEl.textContent=clock(times.black);
  }

  function syncChess(fen) {
    if (typeof Chess !== "function") {
      message("Chess board engine failed to load. Check internet connection and refresh.", true);
      return;
    }
    const target = fen || START_FEN;
    if (!chess || chess.fen() !== target) {
      try { chess = new Chess(target); } catch { chess = new Chess(); }
      selected=""; legalMoves=[];
    }
  }

  function renderBoard() {
    const board=document.getElementById("chessBoard");
    if (!chess) {
      board.innerHTML='<div style="grid-column:1/-1;padding:30px">Loading chess board...</div>';
      return;
    }

    const map={};
    chess.board().forEach((rank,r)=>rank.forEach((piece,c)=>{
      if(piece){
        const sq=`${"abcdefgh"[c]}${8-r}`;
        map[sq]=piece;
      }
    }));

    let html="";
    for(let rank=8;rank>=1;rank--){
      for(let file=0;file<8;file++){
        const sq=`${"abcdefgh"[file]}${rank}`;
        const piece=map[sq];
        const lm=legalMoves.find(m=>m.to===sq);
        const cls=[
          "cm-square",
          ((file+rank)%2===0?"dark":"light"),
          selected===sq?"selected":"",
          lm?(lm.captured?"capture":"legal"):"",
          lastMove&&(lastMove.from===sq||lastMove.to===sq)?"last":""
        ].filter(Boolean).join(" ");
        html+=`<button type="button" class="${cls}" data-square="${sq}" aria-label="${sq}">${piece?`<span class="cm-piece ${piece.color==="w"?"white":"black"}">${pieceGlyph[piece.type]}</span>`:""}</button>`;
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

  function optimisticMove(move, from, to) {
    const movingColor=match.activeColor;
    const times=liveTimes();

    match.whiteTimeMs=times.white;
    match.blackTimeMs=times.black;

    if (movingColor==="white") {
      match.whiteTimeMs += Number(match.incrementMs||3000);
      match.whiteMoves=Number(match.whiteMoves||0)+1;
    } else {
      match.blackTimeMs += Number(match.incrementMs||3000);
      match.blackMoves=Number(match.blackMoves||0)+1;
    }

    if (move.captured) {
      const name=capturedName[move.captured];
      const value=Number(pieceValue[name]||0);
      if (movingColor==="white") match.blackMaterial=Math.max(0,Number(match.blackMaterial||0)-value);
      else match.whiteMaterial=Math.max(0,Number(match.whiteMaterial||0)-value);
    }

    match.fullMoves=Math.min(Number(match.whiteMoves||0),Number(match.blackMoves||0));
    match.activeColor=movingColor==="white"?"black":"white";
    match.fen=chess.fen();
    lastMove={from,to};

    syncClockBase();
    render();
  }

  async function makeMove(from,to){
    if(moveBusy||!match||match.status!=="running")return;

    const active=match.activeColor;
    const expectedTurn=active==="white"?"w":"b";
    if(chess.turn()!==expectedTurn){
      syncChess(match.fen||START_FEN);
      renderBoard();
      return;
    }

    const move=chess.move({from,to,promotion:"q"});
    if(!move){
      selected="";
      legalMoves=[];
      renderBoard();
      return;
    }

    const before = JSON.parse(JSON.stringify(match));
    moveBusy=true;
    selected="";
    legalMoves=[];

    // Immediate visual response; no waiting for Render just to move the piece/clock.
    optimisticMove(move,from,to);

    try{
      const outcome=gameOutcome(active);
      await request(active==="white"?whiteToken:blackToken,"/move",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          capturedPiece: move.captured ? capturedName[move.captured] : "",
          fen: chess.fen(),
          notation: move.san || `${from}-${to}`,
          from,
          to,
          boardResult: outcome.result,
          boardResultReason: outcome.reason
        })
      });

      // One authoritative state request after the move.
      await refreshState();
    }catch(error){
      match=before;
      if(state1) state1.match=before;
      syncChess(before.fen||START_FEN);
      selected="";
      legalMoves=[];
      syncClockBase();
      render();
      message(error.message,true);
    }finally{
      moveBusy=false;
    }
  }

  document.getElementById("chessBoard").addEventListener("click", e=>{
    const btn=e.target.closest(".cm-square");
    if(!btn||!chess||!match)return;

    if(match.status!=="running" || state1?.eventControl?.status!=="running"){
      message("Match is not running.",true);
      return;
    }

    // While a move is being committed, show the board immediately but don't
    // send a second server move until the first one is confirmed.
    if(moveBusy){
      message("Saving previous move…",false);
      return;
    }

    const sq=btn.dataset.square;
    if(selected){
      const valid=legalMoves.some(m=>m.to===sq);
      if(valid){ makeMove(selected,sq); return; }
    }

    const piece=chess.get(sq);
    const wanted=match.activeColor==="white"?"w":"b";
    if(piece && piece.color===wanted){
      selected=sq;
      legalMoves=chess.moves({square:sq,verbose:true});
    } else {
      selected="";
      legalMoves=[];
    }
    renderBoard();
  });

  function renderSecurity(){
    const lock=document.getElementById("checkmateSecurityLock");
    const sec=state1?.security || {violations:0,maxViolations:4,locked:false,lockReason:""};
    const grant=sessionStorage.getItem(coordinatorGrantKey)||"";
    const input=document.getElementById("checkmateCoordinatorAccessKey");
    const note=document.getElementById("checkmateCoordinatorSessionNote");
    document.getElementById("checkmateLockCount").textContent=`${sec.violations||0}/${sec.maxViolations||4}`;
    document.getElementById("checkmateLockReason").textContent=sec.lockReason || "Security violation";
    lock.classList.toggle("active",Boolean(sec.locked));
    if(grant){
      input.value="";
      input.hidden=true;
      input.required=false;
      if(note){note.textContent="Coordinator already verified on this station. Press COORDINATOR UNLOCK.";note.className="coordinator-session-note good"}
    }else{
      input.hidden=false;
      input.required=true;
      if(note){note.textContent="Coordinator verification is required once on this station.";note.className="coordinator-session-note"}
    }
    if(sec.locked){
      document.getElementById("checkmateSecureGate").classList.remove("active");
      clockBase.running=false;
    }
  }

  async function reportSecurityViolation(reason, detail=""){
    if(
      securityReportBusy ||
      !securityArmed ||
      !match ||
      match.status!=="running" ||
      state1?.eventControl?.status!=="running" ||
      state1?.security?.locked
    ) return;

    securityReportBusy=true;

    // Lock the screen immediately while the server records the event.
    const lock=document.getElementById("checkmateSecurityLock");
    lock.classList.add("active");
    document.getElementById("checkmateLockReason").textContent=reason;
    clockBase.running=false;

    try{
      const data=await request(token1,"/security/violation",{
        method:"POST",
        keepalive:true,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({reason,detail})
      });
      state1.security={
        violations:data.violations||0,
        maxViolations:data.maxViolations||4,
        locked:Boolean(data.locked),
        lockReason:reason
      };
      renderSecurity();
      document.getElementById("checkmateUnlockStatus").textContent=data.message||"Coordinator unlock required.";
    }catch(error){
      document.getElementById("checkmateUnlockStatus").textContent=error.message;
    }finally{
      securityReportBusy=false;
    }
  }

  function render(){
    match=state1.match;
    renderSecurity();

    document.getElementById("phasePill").textContent=label(match.phase);
    document.getElementById("boardPill").textContent=`BOARD ${match.boardNumber}`;
    document.getElementById("matchStatusPill").textContent=label(match.status);

    for(const c of ["white","black"]){
      document.getElementById(`${c}Name`).textContent=match[`${c}Name`];
      document.getElementById(`${c}Material`).textContent=match[`${c}Material`];
      document.getElementById(`${c}Moves`).textContent=match[`${c}Moves`];
      document.getElementById(`${c}Tournament`).textContent=Number(match[`${c}TournamentPoints`]||0).toFixed(1);
      document.getElementById(`${c}Card`).classList.toggle("active",match.status==="running"&&match.activeColor===c);
    }

    paintClocks();

    const diff=Number(match.whiteMaterial)-Number(match.blackMaterial);
    document.getElementById("materialDiff").textContent=
      diff===0?"EVEN MATERIAL":diff>0?`WHITE +${diff}`:`BLACK +${Math.abs(diff)}`;

    document.getElementById("fullMove").textContent=`${match.fullMoves} / 50 full moves`;

    document.getElementById("turnLabel").textContent=
      match.status==="completed" ? `RESULT · ${label(match.result)}` :
      match.status==="paused" ? "MATCH STOPPED" :
      match.status==="waiting" ? "WAITING FOR ADMIN START" :
      `${match.activeColor.toUpperCase()} TO MOVE`;

    syncChess(match.fen||START_FEN);
    renderBoard();

    document.getElementById("whiteResign").disabled=match.status!=="running";
    document.getElementById("blackResign").disabled=match.status!=="running";

    if(match.status==="completed") {
      message(`${label(match.result)} · ${match.resultReason||"Match completed"}`);
    } else if(state1.eventControl?.status==="paused") {
      message("Checkmate is stopped by the coordinator.",true);
    } else if(match.status==="waiting") {
      message("Both players are logged in. Wait for admin to start this match.");
    } else if(!moveBusy) {
      message(`${match.activeColor.toUpperCase()} to move · click piece then destination.`);
    }
  }

  async function bootstrap(){
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      [state1,state2]=await Promise.all([
        request(token1,"/state"),
        request(token2,"/state")
      ]);

      if(!state1.match||!state2.match){
        location.replace("checkmate-waiting.html");
        return;
      }

      mapTokens();
      match=state1.match;
      syncClockBase();
      bootstrapped=true;
      render();
    }catch(error){
      message(error.message,true);
    }finally{
      refreshBusy=false;
    }
  }

  async function refreshState(){
    if(!bootstrapped){
      await bootstrap();
      return;
    }
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      // Only one state request is needed after initial two-player verification.
      state1=await request(token1,"/state");
      if(!state1.match){
        location.replace("checkmate-waiting.html");
        return;
      }
      match=state1.match;
      syncClockBase();
      render();
    }catch(error){
      message(error.message,true);
    }finally{
      refreshBusy=false;
    }
  }

  async function resign(color){
    if(!confirm(`${color.toUpperCase()} resigns this match?`))return;
    try{
      await request(color==="white"?whiteToken:blackToken,"/resign",{method:"POST"});
      await refreshState();
    }catch(error){
      message(error.message,true);
    }
  }

  document.getElementById("whiteResign").onclick=()=>resign("white");
  document.getElementById("blackResign").onclick=()=>resign("black");
  document.getElementById("refreshMatch").onclick=refreshState;

  const gate=document.getElementById("checkmateSecureGate");
  document.getElementById("enterCheckmateFullscreen").onclick=async()=>{
    try{
      await document.documentElement.requestFullscreen();
      securityArmed=true;
      gate.classList.remove("active");
      document.getElementById("fullscreenStatus").textContent="";
    }catch{
      document.getElementById("fullscreenStatus").textContent="Fullscreen permission is required.";
    }
  };

  document.addEventListener("fullscreenchange",()=>{
    if(document.fullscreenElement){
      if(!state1?.security?.locked) gate.classList.remove("active");
      return;
    }

    if(
      securityArmed &&
      match?.status==="running" &&
      state1?.eventControl?.status==="running" &&
      !state1?.security?.locked
    ){
      reportSecurityViolation("Fullscreen exited","Player station left required fullscreen mode");
    }else if(!state1?.security?.locked){
      gate.classList.add("active");
    }
  });

  document.addEventListener("visibilitychange",()=>{
    if(
      document.hidden &&
      securityArmed &&
      match?.status==="running" &&
      state1?.eventControl?.status==="running" &&
      !state1?.security?.locked
    ){
      reportSecurityViolation("Tab/window hidden","Checkmate page became hidden during a running match");
    }
  });

  document.getElementById("checkmateUnlockForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const password=document.getElementById("checkmateCoordinatorAccessKey").value;
    const grant=sessionStorage.getItem(coordinatorGrantKey)||"";
    const status=document.getElementById("checkmateUnlockStatus");
    if(!password&&!grant){status.textContent="Coordinator verification is required once on this station.";return}

    status.textContent=grant?"Using verified coordinator session...":"Checking coordinator password...";
    try{
      const data=await request(token1,"/security/unlock",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password,grant})
      });

      if(data.unlockGrant)sessionStorage.setItem(coordinatorGrantKey,data.unlockGrant);
      document.getElementById("checkmateCoordinatorAccessKey").value="";
      status.textContent=data.message||"Unlocked";
      state1.security={
        violations:data.violations||0,
        maxViolations:data.maxViolations||4,
        locked:false,
        lockReason:""
      };
      document.getElementById("checkmateSecurityLock").classList.remove("active");

      try{
        await document.documentElement.requestFullscreen();
        securityArmed=true;
        gate.classList.remove("active");
      }catch{
        gate.classList.add("active");
        document.getElementById("fullscreenStatus").textContent="Enter fullscreen to continue.";
      }

      await refreshState();
    }catch(error){
      status.textContent=error.message;
    }
  });

  // Smooth clock animation, independent of backend latency.
  setInterval(paintClocks,200);

  // Server reconciliation stays authoritative, while the visible clocks run locally.
  // One GET every 4 seconds keeps moves responsive without hammering the backend.
  setInterval(()=>{ if(!moveBusy && !document.hidden) refreshState(); },4000);

  bootstrap();
})();